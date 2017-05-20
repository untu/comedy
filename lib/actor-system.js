/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/* eslint no-path-concat: "off" */

var common = require('./utils/common.js');
var Logger = require('./utils/logger.js');
var InMemoryActor = require('./in-memory-actor.js');
var ForkedActorParent = require('./forked-actor-parent.js');
var ForkedActorChild = require('./forked-actor-child.js');
var ForkedActorProxy = require('./forked-actor-proxy.js');
var RootActor = require('./root-actor.js');
var RoundRobinBalancerActor = require('./standard/round-robin-balancer-actor.js');
var MessageSocket = require('./net/message-socket.js');
var childProcess = require('child_process');
var appRootPath = require('app-root-path');
var requireDir = require('require-dir');
var toSource = require('tosource');
var bson = require('bson');
var P = require('bluebird');
var _ = require('underscore');
var s = require('underscore.string');
var randomString = require('randomstring');
var globalRequire = require;
var fs = require('fs');
var net = require('net');
var http = require('http');

P.promisifyAll(fs);

// Default actor system instance reference.
var defaultSystem;

/**
 * An actor system.
 */
class ActorSystem {
  /**
   * @param {Object} [options] Actor system options.
   * - {Object|Function} [context] Actor system context behaviour.
   * - {Object} [log] Custom logger.
   * - {Boolean} [test] If true, sets this system into test mode.
   * - {Boolean} [debug] If true, sets this system into debug mode.
   * - {Boolean} [forceInMemory] If true, all actors will be launched in 'in-memory' mode.
   * - {Object} [root] Root actor behaviour.
   * - {Object} [rootParameters] Root actor custom parameters.
   */
  constructor(options) {
    options = options || {};

    this.debugPortCounter = 1;
    this.log = options.log || new Logger();
    this.options = _.clone(options);
    this.resourceDefPromises = {};
    this.resourceDefClassesPromise = P.resolve([]);

    if (options.resources) {
      this.resourceDefClassesPromise = P.map(options.resources, resource => {
        if (_.isString(resource)) return this._loadDefinition(resource);

        return resource;
      });
    }

    if (options.test) this.log.setLevel(this.log.levels().Error); // Only output errors in tests.

    if (options.debug) {
      this.log.setLevel(this.log.levels().Debug); // Overrides test option.

      P.longStackTraces();
    }

    var additionalRequires = this.options.additionalRequires;

    if (additionalRequires) {
      _.isArray(additionalRequires) || (additionalRequires = [additionalRequires]);

      _.each(additionalRequires, path => {
        require(path);
      });
    }

    if (options.context) {
      this.log.warn('Use of context is deprecated and will be removed in future versions. Please use separate ' +
        'resource definitions ("resources" option).');
    }

    var contextPromise = P.resolve();

    this.context = {};

    if (options.context) {
      this.contextDefinition = options.context;

      contextPromise = contextPromise
        .then(() => this._createContext(this.contextDefinition))
        .then(context => {
          this.context = context;

          if (_.isFunction(this.context.initialize)) {
            return this.context.initialize(this._selfProxy());
          }
        });
    }

    if (options.root) {
      // Create root with custom behaviour.
      this.rootActorPromise = contextPromise.then(() => this.createActor(options.root, null, {
        mode: 'in-memory',
        customParameters: options.rootParameters
      }));

      if (options.forked) {
        // Create forked root with proper parent.
        this.rootActorPromise = this.rootActorPromise.then(rootActor => {
          return new ForkedActorChild(
            this,
            process,
            rootActor,
            options.forked.id);
        });
      }
    }
    else {
      // Create default root.
      this.rootActorPromise = contextPromise.return(new RootActor(this, { forked: !!options.forked }));
    }

    this.marshallers = {};

    // Initialize marshallers.
    if (options.marshallers) {
      // Validate marshaller array.
      var marshallerTypes = _.countBy(options.marshallers, marshaller => typeof marshaller);

      if (_.keys(marshallerTypes).length > 1) {
        this.rootActorPromise = P.throw(new Error('Mixed types in marshallers configuration array are not allowed.'));
      }
      else {
        this.rootActorPromise = this.rootActorPromise.tap(() => {
          return P.reduce(options.marshallers, (memo, marshaller) => {
            return P.resolve()
              .then(() => {
                if (_.isString(marshaller)) {
                  return this._loadDefinition(marshaller);
                }

                return marshaller;
              })
              .then(marshaller0 => {
                if (_.isFunction(marshaller0)) {
                  return this._injectResources(marshaller0);
                }
                else {
                  return _.clone(marshaller0);
                }
              })
              .then(marshallerInstance => {
                var types = this._readProperty(marshallerInstance, 'type');

                _.isArray(types) || (types = [types]);

                _.each(types, type => {
                  var typeName = _.isString(type) ? type : this._typeName(type);

                  if (!typeName) throw new Error('Failed to determine type name for marshaller: ' + marshallerInstance);

                  marshallerInstance.type = typeName;
                  memo[typeName] = marshallerInstance;
                });

                return memo;
              });
          }, {}).then(marshallers => {
            this.marshallers = marshallers;
          });
        });
      }
    }

    this.rootActorPromise = this.rootActorPromise
      .tap(() => this._loadConfiguration(options.config))
      .tap(actor => actor.initialize());

    this.forkedProcesses = {};

    // Kill child process if self process is killed.
    this.sigintHandler = () => {
      this.log.info('Received SIGINT, exiting');

      process.exit(0);
    };
    this.sigtermHandler = () => {
      this.log.info('Received SIGTERM, exiting');

      process.exit(0);
    };
    this.exitHandler = () => {
      _.each(this.forkedProcesses, item => {
        this.log.debug('Killing forked actor ' + item.actor);

        item.process.kill();
      });
    };
    process.once('SIGINT', this.sigintHandler);
    process.once('SIGTERM', this.sigtermHandler);
    process.once('exit', this.exitHandler);
  }

  /**
   * @returns {*} Context of this system.
   */
  getContext() {
    return this.context;
  }

  /**
   * @returns {*} Logger for this system.
   */
  getLog() {
    return this.log;
  }

  /**
   * Returns a marshaller for a given type name.
   *
   * @param {String} typeName Type name.
   * @returns {Object|undefined} Marshaller for a given message or undefined, if a marshaller for a given
   * message was not found.
   */
  getMarshaller(typeName) {
    return this.marshallers[typeName];
  }

  /**
   * Returns a marshaller for a given message.
   *
   * @param {*} message Message.
   * @returns {Object|undefined} Marshaller for a given message or undefined, if a marshaller for a given
   * message was not found.
   */
  getMarshallerForMessage(message) {
    return this.marshallers[this._typeName(message)];
  }

  /**
   * @returns {P} Promise which yields root actor for this system.
   */
  rootActor() {
    return this.rootActorPromise;
  }

  /**
   * Creates an actor.
   *
   * @param {Object|String} Definition Actor definition object or module path.
   * @param {Actor} parent Actor parent.
   * @param {Object} [options] Actor creation options.
   * @returns {*} Promise that yields a created actor.
   */
  createActor(Definition, parent, options) {
    options = options || {};

    return P.resolve()
      .then(() => {
        if (_.isString(Definition)) {
          // Module path is specified => load actor module.
          return this._loadDefinition(Definition);
        }

        return Definition;
      })
      .then(Definition0 => {
        var actorName = options.name || this._actorName(Definition0);

        // Determine actor configuration.
        if (this.config && actorName) {
          var actorConfig = this.config[s.decapitalize(actorName)];

          options = _.extend({ mode: 'in-memory' }, actorConfig, options);
        }

        // Perform clusterization, if needed.
        if (options.clusterSize > 1) {
          return P.resolve()
            .then(() => {
              var balancerActor = new RoundRobinBalancerActor(this, parent, actorName);

              var childPromises = _.times(options.clusterSize, () =>
                balancerActor.createChild(Definition, _.extend({}, options, { clusterSize: 1 })));

              return P.all(childPromises).return(balancerActor);
            });
        }

        if (this.options.forceInMemory && options.mode != 'in-memory') {
          this.log.warn('Forcing in-memory mode due to forceInMemory flag for actor:', actorName);
          options = _.extend({}, options, { mode: 'in-memory' });
        }

        // Actor creation.
        switch (options.mode || 'in-memory') {
          case 'in-memory':
            return this._createInMemoryActor(Definition0, parent, _.defaults({ name: actorName }, options));

          case 'forked':
            return this._createForkedActor(Definition, parent, _.defaults({ name: actorName }, options));

          case 'remote':
            return this._createRemoteActor(Definition, parent, _.defaults({ name: actorName }, options));

          default:
            return P.resolve().throw(new Error('Unknown actor mode: ' + options.mode));
        }
      });
  }

  /**
   * Starts network port listening, allowing remote actor creation by other systems.
   *
   * @returns {P} Promise, which is resolved once server is ready to accept requests or a
   * listening error has occurred.
   */
  listen() {
    if (!this.serverPromise) {
      this.serverPromise = P.fromCallback(cb => {
        this.server = net.createServer();
        this.server.listen(6161);

        this.server.on('listening', () => {
          this.log.info('Listening on ' + this.server.address());

          cb();
        });
        this.server.on('error', err => {
          this.log.error('Net server error: ' + err.message);

          cb(err);
        });
        this.server.on('connection', socket => {
          var msgSocket = new MessageSocket(socket);

          msgSocket.on('message', msg => {
            if (msg.type != 'create-actor') return;

            var psArgs = [];

            msg.name && psArgs.push(msg.name);

            var workerProcess = childProcess.fork(__dirname + '/forked-actor-worker.js', psArgs);

            workerProcess.send(msg, (err) => {
              if (err) return msgSocket.write({ error: 'Failed to create remote actor process: ' + err.message });

              // Redirect forked process response to parent actor.
              workerProcess.once('message', msg => {
                msgSocket.write(msg);
                msgSocket.end();

                // Close IPC channel to make worker process fully independent.
                workerProcess.disconnect();
                workerProcess.unref();
              });
            });

            // Handle forked process startup failure.
            workerProcess.once('error', err => {
              msgSocket.write({ error: 'Failed to create remote actor process: ' + err.message });
            });
          });
        });
      });
    }

    return this.serverPromise;
  }

  /**
   * Creates a process-local (in-memory) actor.
   *
   * @param {Object|Function} Definition Actor behaviour definition.
   * @param {Actor} parent Actor parent.
   * @param {Object} options Operation options.
   * - {String} name Actor name.
   * @returns {*} Promise that yields a newly-created actor.
   * @private
   */
  _createInMemoryActor(Definition, parent, options) {
    return P.resolve()
      .then(() => {
        if (_.isFunction(Definition)) {
          return this._injectResources(Definition);
        }

        return Definition;
      })
      .then(def => new InMemoryActor(this, parent, def, options.name, options.customParameters));
  }

  /**
   * Creates a forked actor.
   *
   * @param {Object|String} definition Actor behaviour definition or module path.
   * @param {Actor} parent Actor parent.
   * @param {Object} [options] Operation options.
   * @returns {P} Promise that yields a newly-created actor.
   * @private
   */
  _createForkedActor(definition, parent, options) {
    options = options || {};

    return P.resolve()
      .then(() => {
        var psArgs = [];

        options.name && psArgs.push(options.name);

        // Handle debugging: increment debugger port for child process.
        var execArgv = _.map(process.execArgv, arg => {
          var match = arg.match(/^--debug-brk=(\d+)/);

          if (match) {
            var debugPort = parseInt(match[1]);

            return '--debug-brk=' + (debugPort + this.debugPortCounter++);
          }

          return arg;
        });

        var workerProcess = childProcess.fork(__dirname + '/forked-actor-worker.js', psArgs, { execArgv: execArgv });

        return new P((resolve, reject) => {
          var createMsg = this._generateActorCreationMessage(definition, parent, options);

          var marshaledCustomParameters = {};
          var socketHandle;
          createMsg.body.customParameters = _.mapObject(options.customParameters, (val, key) => {
            if (val instanceof http.Server || val instanceof net.Server) {
              if (socketHandle) throw new Error('Only one socket handle is allowed in custom parameters.');

              socketHandle = val;
              marshaledCustomParameters[key] = { marshallerType: '_socketHandle' };

              return val instanceof http.Server ? 'http.Server' : 'net.Server';
            }

            return val;
          });

          var actor;

          const errCb = (err) => {
            if (err) return reject(err);

            // Wait for response from forked process.
            workerProcess.once('message', (msg) => {
              if (msg.error)
                return reject(new Error(msg.error));

              if (msg.type != 'actor-created' || !msg.body || !msg.body.id)
                return reject(new Error('Unexpected response for "create-actor" message.'));

              actor = new ForkedActorProxy(new ForkedActorParent(
                this,
                parent,
                workerProcess,
                msg.body.id,
                options.name));

              this.forkedProcesses[actor.getId()] = {
                actor: actor,
                process: workerProcess
              };

              resolve(actor);
            });
          };

          // Send a message to forked process and await response.
          if (socketHandle) {
            createMsg.body.marshaledCustomParameters = marshaledCustomParameters;

            workerProcess.send(createMsg, socketHandle, errCb);
          }
          else {
            workerProcess.send(createMsg, errCb);
          }

          // Handle forked process startup failure.
          workerProcess.once('error', err => {
            if (!actor) reject(new Error('Failed to fork: ' + err));
          });

          workerProcess.once('exit', () => {
            if (!actor) return;

            delete this.forkedProcesses[actor.getId()];

            var actor0 = options.originalActor || actor;

            // Actor respawn support.
            if (options.onCrash == 'respawn' && !this.destroying && !actor0.isDestroying()) {
              this.log.warn('Actor ' + actor0 + ' has crashed, respawning...');

              this
                ._createForkedActor(definition, parent, _.extend({}, options, {
                  id: actor0.getId(),
                  originalActor: actor0
                }))
                .tap(newActor => newActor.initialize())
                .then(newActor => {
                  this.log.info('Actor ' + actor0 + ' successfully respawned.');

                  actor0.setWrapped(newActor.getWrapped());
                });
            }
            else {
              this.log.info('Actor process exited, actor ' + actor0);
            }
          });
        });
      });
  }

  /**
   * Creates a remote actor.
   *
   * @param {Object|String} definition Actor behaviour definition or module path.
   * @param {Actor} parent Actor parent.
   * @param {Object} [options] Operation options.
   * @returns {P} Promise that yields a newly-created actor.
   * @private
   */
  _createRemoteActor(definition, parent, options) {
    return new P((resolve, reject) => {
      var host = options.host;
      var port = options.port || 6161;

      if (!host) return reject(new Error('Required option "host" missing for "forked" mode.'));

      var socket = new MessageSocket(net.connect(port, host));

      socket.on('error', reject);
      socket.on('connect', common.guard(reject, () => {
        var createMsg = this._generateActorCreationMessage(definition, parent, options);

        socket.write(createMsg, err => {
          if (err) return reject(err);

          socket.once('message', common.guard(reject, msg => {
            socket.end(); // Close connection.

            if (msg.error)
              return reject(new Error(msg.error));

            if (msg.type != 'actor-created' || !msg.body || !msg.body.id || !msg.body.port)
              return reject(new Error('Unexpected response for "create-actor" message.'));

            // Now connect to newly-created actor.
            var actorSocket = new MessageSocket(net.connect(msg.body.port, host));

            actorSocket.on('error', reject);
            actorSocket.on('connect', common.guard(reject, () => {
              var actor = new ForkedActorProxy(new ForkedActorParent(
                this,
                parent,
                actorSocket,
                msg.body.id,
                options.name));

              resolve(actor);
            }));
          }));
        });
      }));
    });
  }

  /**
   * Generates actor creation message.
   *
   * @param {Object|String} definition Actor behaviour definition or module path.
   * @param {Actor} parent Actor parent.
   * @param {Object} [options] Operation options.
   * @returns {P} Promise that yields a newly-created actor.
   * @private
   */
  _generateActorCreationMessage(definition, parent, options = {}) {
    var createMsg = {
      type: 'create-actor',
      body: {
        definition: _.isString(definition) ? definition : this._serializeDefinition(definition),
        definitionFormat: _.isString(definition) ? 'modulePath' : 'serialized',
        config: this.config,
        test: this.options.test,
        debug: this.options.debug,
        parent: {
          id: parent.getId()
        },
        logLevel: this.log.getLevel(),
        additionalRequires: this.options.additionalRequires,
        customParameters: options.customParameters
      }
    };

    options.name && (createMsg.body.name = options.name);

    if (this.contextDefinition) {
      if (_.isString(this.contextDefinition)) {
        createMsg.body.context = this.contextDefinition;
        createMsg.body.contextFormat = 'modulePath';
      }
      else {
        createMsg.body.context = this._serializeDefinition(this.contextDefinition);
        createMsg.body.contextFormat = 'serialized';
      }
    }

    if (this.options.marshallers) {
      var marshallerFormat = 'modulePath';

      createMsg.body.marshallers = _.map(this.options.marshallers, marshaller => {
        if (!_.isString(marshaller)) {
          marshallerFormat = 'serialized';

          return this._serializeDefinition(marshaller);
        }
        else {
          return marshaller;
        }
      });
      createMsg.body.marshallerFormat = marshallerFormat;
    }

    if (this.options.resources) {
      var resourceFormat = [];

      createMsg.body.resources = _.map(this.options.resources, resourceDef => {
        if (!_.isString(resourceDef)) {
          resourceFormat.push('serialized');

          return this._serializeDefinition(resourceDef);
        }
        else {
          resourceFormat.push('modulePath');

          return resourceDef;
        }
      });
      createMsg.body.resourceFormat = resourceFormat;
    }

    return createMsg;
  }

  /**
   * Generates a new ID for an actor.
   *
   * @returns {String} New actor ID.
   */
  generateActorId() {
    return new bson.ObjectID().toString();
  }

  /**
   * Helper function to correctly import modules in different processes with
   * different directory layout. If a module path ends with /, imports the whole
   * directory.
   *
   * @param {String} modulePath Path of the module to import. If starts with /, a module
   * is searched relative to project directory.
   * @returns {*} Module import result.
   */
  require(modulePath) {
    if (modulePath[0] != '/' && modulePath[0] != '.') {
      return globalRequire(modulePath);
    }
    else if (_.last(modulePath) == '/') {
      return this.requireDirectory(modulePath);
    }
    else {
      return globalRequire(appRootPath + modulePath);
    }
  }

  /**
   * Imports all modules from a given directory.
   *
   * @param {String} path Directory path. If starts with /, the path will be relative to a
   * project directory (the one with package.json file).
   * @returns {Object} Module file name -> loaded module map object.
   */
  requireDirectory(path) {
    var path0 = path;

    if (path0[0] == '/') {
      path0 = appRootPath + path0;
    }

    return requireDir(path0);
  }

  /**
   * Destroys this system. All actors will be destroyed and context destroy hook will be called.
   *
   * @returns {P} Operation promise.
   */
  destroy() {
    if (this.destroying) return this.destroyPromise;

    this.destroying = true;

    process.removeListener('SIGINT', this.sigintHandler);
    process.removeListener('SIGTERM', this.sigtermHandler);
    process.removeListener('exit', this.exitHandler);

    this.destroyPromise = this.rootActorPromise
      // Destroy root actor.
      .then(rootActor => rootActor.destroy())
      // Destroy system resources.
      .then(() => {
        return P.map(_.values(this.resourceDefPromises), resource => {
          if (resource && _.isFunction(resource.destroy)) {
            return resource.destroy();
          }
        });
      })
      // Destroy system context.
      .then(() => {
        if (_.isFunction(this.context.destroy)) {
          return this.context.destroy(this._selfProxy());
        }
      })
      .then(() => {
        if (this.server) {
          this.server.close();
        }
      })
      .finally(() => {
        if (this.options.forked) {
          this.log.info('Killing forked system process.');

          process.exit();
        }
      });

    return this.destroyPromise;
  }

  /**
   * Loads actor behaviour definition from a given module.
   *
   * @param {String} path Actor behaviour module path.
   * @returns {P} Operation promise, which yields an actor behaviour.
   * @private
   */
  _loadDefinition(path) {
    return P.resolve().then(() => {
      var ret = this.require(path);

      // TypeScript default export support.
      if (ret.default) {
        ret = ret.default;
      }

      return ret;
    });
  }

  /**
   * Determines a given definition name.
   *
   * @param {Object|Function} Definition Behaviour definition.
   * @param {String} nameField Name of an additional field to use for name resolution.
   * @returns {String} Definition name or empty string, if name is not defined.
   * @private
   */
  _definitionName(Definition, nameField) {
    // Use 'getName' getter, if present.
    if (_.isFunction(Definition.getName)) return Definition.getName();

    // Take 'actorName' field, if present.
    if (Definition.actorName) return _.result(Definition, nameField);

    // Take 'name' field, if present.
    if (Definition.name) return _.result(Definition, 'name');

    // Use class name, if present.
    var typeName = this._typeName(Definition);

    if (typeName) return typeName;

    if (_.isFunction(Definition)) {
      return this._actorName(new Definition());
    }

    return '';
  }

  /**
   * Determines actor name based on actor definition.
   *
   * @param {Object|Function} Definition Actor behaviour definition.
   * @returns {String} Actor name or empty string, if actor name is not defined.
   * @private
   */
  _actorName(Definition) {
    return this._definitionName(Definition, 'actorName');
  }

  /**
   * Determines resource name based on resource definition.
   *
   * @param {Object|Function} Definition Resource definition.
   * @returns {String} Resource name or empty string, if name is not defined.
   * @private
   */
  _resourceName(Definition) {
    return this._definitionName(Definition, 'resourceName');
  }

  /**
   * Attempts to determine a name of a given type.
   *
   * @param {*} type Type of interest.
   * @returns {String|undefined} Type name or undefined, if type name cannot be determined.
   * @private
   */
  _typeName(type) {
    if (!type) return;

    if (_.isFunction(type)) {
      return type.typeName || type.name;
    }

    if (type.constructor) {
      return _.result(type.constructor, 'typeName') || type.constructor.name;
    }
  }

  /**
   * Performs actor definition resource injection.
   *
   * @param {Function} Definition Definition class.
   * @returns {P} Promise of definition instance with injected resources.
   * @private
   */
  _injectResources(Definition) {
    var resourceNames = _.result(Definition, 'inject');

    if (resourceNames && !_.isArray(resourceNames)) {
      resourceNames = [resourceNames];
    }

    // Resource injection.
    if (resourceNames && _.isFunction(Definition)) {
      return P
        .map(resourceNames, resourceName => {
          return P.resolve()
            .then(() => {
              if (this.resourceDefPromises[resourceName]) return this.resourceDefPromises[resourceName];

              var resourceDefPromise = this.resourceDefClassesPromise
                .then(resourceDefClasses => {
                  // Attempt to find a resource definition class.
                  var ResourceDefCls = _.find(resourceDefClasses, ResourceDefCls => {
                    var resourceName0 = this._resourceName(ResourceDefCls);

                    return resourceName0 == resourceName;
                  });

                  if (ResourceDefCls) {
                    var resourceInstance = ResourceDefCls;

                    if (!common.isPlainObject(ResourceDefCls)) {
                      resourceInstance = new ResourceDefCls();
                    }

                    if (_.isFunction(resourceInstance.initialize)) {
                      return P.resolve(resourceInstance)
                        .tap(() => resourceInstance.initialize(this));
                    }
                    else {
                      return resourceInstance;
                    }
                  }
                });

              this.resourceDefPromises[resourceName] = resourceDefPromise;

              return resourceDefPromise;
            })
            .then(resourceDef => resourceDef && resourceDef.getResource())
            .then(resource => {
              if (!resource) {
                // Look for resource in context, if any.
                if (this.context) {
                  var ctxResource = this._readProperty(this.context, resourceName);

                  if (ctxResource) {
                    return ctxResource;
                  }
                }

                throw new Error(`Failed to inject resource "${resourceName}" to actor behaviour ${Definition}`);
              }

              return resource;
            });
        })
        // Create an instance of actor definition, passing resources as constructor arguments.
        .then(resources => new Definition(...resources));
    }

    return P.resolve(new Definition());
  }

  /**
   * Reads a given property from an object. Attempts to read either directly by name or by getter (if present).
   *
   * @param {Object} object Object of interest.
   * @param {String} propName Property name.
   * @returns {*} Property value or undefined.
   * @private
   */
  _readProperty(object, propName) {
    var ret = object[propName];

    if (!ret) {
      var getterName = `get${s.capitalize(propName)}`;

      if (_.isFunction(object[getterName])) {
        ret = object[getterName]();
      }
    }

    return ret;
  }

  /**
   * Serializes a given actor behaviour definition for transferring to other process.
   *
   * @param {Object|Function|Array} def Actor behaviour definition.
   * @returns {String} Serialized actor behaviour.
   * @private
   */
  _serializeDefinition(def) {
    if (_.isArray(def)) {
      return toSource(_.map(def, item => this._serializeDefinition(item)));
    }

    if (common.isPlainObject(def)) return toSource(def);

    if (_.isFunction(def)) { // Class-defined behaviour.
      return this._serializeClassDefinition(def);
    }

    throw new Error('Cannot serialize actor behaviour: ' + def);
  }

  /**
   * Serializes a given class-defined actor behaviour.
   *
   * @param {Function} def Class-defined actor behaviour.
   * @returns {String} Serialized actor behaviour.
   * @private
   */
  _serializeClassDefinition(def) {
    // Get a base class for behaviour class.
    var base = Object.getPrototypeOf(def);
    var baseBehaviour = '';

    if (base && base.name) {
      // Have a user-defined super class. Serialize it as well.
      baseBehaviour = this._serializeClassDefinition(base);
    }

    var selfString = def.toString();

    if (s.startsWith(selfString, 'function')) {
      selfString = this._serializeEs5ClassDefinition(def, selfString, base.name);
    }

    return baseBehaviour + selfString;
  }

  /**
   * Serializes a given ES5 class actor behaviour definition.
   *
   * @param {Function} def Actor behaviour definition in ES5 class form.
   * @param {String} [selfString] Stringified class head.
   * @param {String} [baseName] Base class name.
   * @returns {String} Serialized actor behaviour.
   * @private
   */
  _serializeEs5ClassDefinition(def, selfString, baseName) {
    var clsName = this._actorName(def);

    if (!clsName) {
      clsName = randomString.generate({
        length: 12,
        charset: 'alphabetic'
      });
    }

    var expressions = [`var ${clsName} = ${selfString || def.toString()};\n`];

    if (baseName) {
      expressions.push(`_inherits(${clsName}, ${baseName});`);
    }

    var staticMemberNames = Object.getOwnPropertyNames(def);

    _.each(staticMemberNames, memberName => {
      if (memberName != 'length' && memberName != 'prototype' && memberName != 'name') {
        expressions.push(`${clsName}.${memberName} = ${def[memberName].toString()};\n`);
      }
    });

    var membersNames = Object.getOwnPropertyNames(def.prototype);

    _.each(membersNames, memberName => {
      if (memberName != 'constructor') {
        expressions.push(`${clsName}.prototype.${memberName} = ${def.prototype[memberName].toString()};\n`);
      }
    });

    expressions.push(`${clsName};`);

    return expressions.join('');
  }

  /**
   * Generates a lightweight proxy object for this system to expose only
   * specific methods to a client.
   *
   * @returns {Object} Proxy object.
   * @private
   */
  _selfProxy() {
    return {
      require: this.require.bind(this),
      getLog: this.getLog.bind(this)
    };
  }

  /**
   * Creates a context described by a given behaviour.
   *
   * @param {Function|Object|String} Behaviour Behaviour describing context.
   * @returns {P} Operation promise, which yields a created context instance.
   * @private
   */
  _createContext(Behaviour) {
    return P.resolve()
      .then(() => {
        if (_.isString(Behaviour)) {
          return this._loadDefinition(Behaviour);
        }

        return Behaviour;
      })
      .then(Behaviour0 => {
        if (_.isFunction(Behaviour0)) {
          return new Behaviour0();
        }
        else {
          return Behaviour0;
        }
      });
  }

  /**
   * Loads actor configuration.
   *
   * @param {Object|String} config Actor configuration object or file path.
   * @returns {P} Operation promise.
   * @private
   */
  _loadConfiguration(config) {
    if (_.isObject(config)) {
      this.config = config;

      this.options.forked || this.log.info('Using programmatic actor configuration.');

      return P.resolve();
    }

    // Do not load configuration from file in test mode.
    if (this.options.test) return P.resolve();

    this.config = {};

    var defaultPath = appRootPath + '/actors.json';

    return fs.readFileAsync(defaultPath)
      .then(data => {
        this.log.info('Loaded default actor configuration file: ' + defaultPath);

        this.config = JSON.parse(data);
      })
      .catch(() => {
        this.log.info(
          'Didn\'t find (or couldn\'t load) default configuration file ' + defaultPath + '.');
      })
      .then(() => {
        if (!_.isString(config)) return;

        // Config path specified => read custom configuration and extend default one.
        return fs.readFileAsync(config)
          .then(data => {
            this.log.info('Loaded external actor configuration file: ' + config);

            if (!_.isEmpty(this.config)) {
              this.log.info('Extending default actor configuration (' + defaultPath +
                ') with external actor configuration (' + config + ')');
            }

            this.config = _.extend(this.config, JSON.parse(data));
          })
          .catch(() => {
            this.log.info(
              'Didn\'t find (or couldn\'t load) external actor configuration file ' + config +
              ', leaving default configuration.');
          });
      })
      .then(() => {
        this.log.info('Resulting actor configuration: ' + JSON.stringify(this.config, null, 2));
      });
  }

  /**
   * @returns {ActorSystem} Default actor system.
   */
  static default() {
    if (defaultSystem) {
      defaultSystem = new ActorSystem();
    }

    return defaultSystem;
  }

  /**
   * A recommended function for ES5 class inheritance. If this function is used for inheritance,
   * the actors are guaranteed to be successfully transferred to forked/remote nodes.
   *
   * @param {Function} subClass Sub class.
   * @param {Function} superClass Super class.
   */
  static inherits(subClass, superClass) {
    subClass.prototype = Object.create(superClass && superClass.prototype, {
      constructor: {
        value: subClass,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });

    Object.setPrototypeOf(subClass, superClass);
  }
}

module.exports = ActorSystem;