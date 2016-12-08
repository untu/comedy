/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/* eslint no-path-concat: "off" */

require('ts-node/register'); // TypeScript support.
var common = require('./utils/common.js');
var Logger = require('./utils/logger.js');
var InMemoryActor = require('./in-memory-actor.js');
var ForkedActorParent = require('./forked-actor-parent.js');
var ForkedActorChild = require('./forked-actor-child.js');
var ForkedActorStub = require('./forked-actor-stub.js');
var RootActor = require('./root-actor.js');
var RoundRobinBalancerActor = require('./standard/round-robin-balancer-actor.js');
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
   */
  constructor(options) {
    options = options || {};

    this.debugPortCounter = 1;
    this.log = options.log || new Logger();
    this.options = _.clone(options);
    
    if (options.test) this.log.setLevel(this.log.levels().Error); // Only output errors in tests.
    
    if (options.debug) {
      this.log.setLevel(this.log.levels().Debug); // Overrides test option.

      P.longStackTraces();
    }

    this.contextBehaviour = options.context || {};
    var contextPromise = this._createContext(this.contextBehaviour)
      .then(context => {
        this.context = context;

        if (_.isFunction(this.context.initialize)) {
          return this.context.initialize(this._selfProxy());
        }
      });

    if (options.root) {
      // Create root with custom behaviour.
      this.rootActorPromise = contextPromise.then(() => this.createActor(options.root, null, { mode: 'in-memory' }));

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
                  return this._loadBehaviour(marshaller);
                }

                return marshaller;
              })
              .then(marshaller0 => {
                if (_.isFunction(marshaller0)) {
                  marshaller0 = this._injectResources(marshaller0);
                }
                else {
                  marshaller0 = _.clone(marshaller0);
                }

                var types = this._readProperty(marshaller0, 'type');

                _.isArray(types) || (types = [types]);

                _.each(types, type => {
                  var typeName = _.isString(type) ? type : this._typeName(type);

                  if (!typeName) throw new Error('Failed to determine type name for marshaller: ' + marshaller0);

                  marshaller0.type = typeName;
                  memo[typeName] = marshaller0;
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
      .tap(actor => {
        return actor.initialize()
          .catch(err => {
            this.log.warn('Actor initialization failed, destroying, actor=' + actor);

            actor.destroy();

            throw err;
          });
      });

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
   * @param {Object|String} Behaviour Actor behaviour object or module path.
   * @param {Actor} parent Actor parent.
   * @param {Object} [options] Actor creation options.
   * @returns {*} Promise that yields a created actor.
   */
  createActor(Behaviour, parent, options) {
    options = options || {};

    return P.resolve()
      .then(() => {
        if (_.isString(Behaviour)) {
          // Module path is specified => load actor module.
          return this._loadBehaviour(Behaviour);
        }

        return Behaviour;
      })
      .then(Behaviour0 => {
        var actorName = options.name || this._actorName(Behaviour0);

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
                balancerActor.createChild(Behaviour, _.extend({}, options, { clusterSize: 1 })));

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
            return this.createInMemoryActor(Behaviour0, parent, { name: actorName });

          case 'forked':
            return this.createForkedActor(Behaviour, parent, _.extend({ name: actorName }, options));

          default:
            return P.resolve().throw(new Error('Unknown actor mode: ' + options.mode));
        }
      });
  }

  /**
   * Creates a process-local (in-memory) actor.
   *
   * @param {Object|Function} Behaviour Actor behaviour definition.
   * @param {Actor} parent Actor parent.
   * @param {Object} options Operation options.
   * - {String} name Actor name.
   * @returns {*} Promise that yields a newly-created actor.
   */
  createInMemoryActor(Behaviour, parent, options) {
    return P.resolve()
      .then(() => {
        var behaviour0 = Behaviour;

        if (_.isFunction(Behaviour)) {
          behaviour0 = this._injectResources(Behaviour);
        }

        return new InMemoryActor(this, parent, behaviour0, options.name);
      });
  }

  /**
   * Creates a forked actor.
   *
   * @param {Object|String} behaviour Actor behaviour definition or module path.
   * @param {Actor} parent Actor parent.
   * @param {Object} [options] Operation options.
   * @returns {P} Promise that yields a newly-created actor.
   */
  createForkedActor(behaviour, parent, options) {
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
          var createMsg = {
            type: 'create-actor',
            body: {
              behaviour: _.isString(behaviour) ? behaviour : this._serializeBehaviour(behaviour),
              behaviourFormat: _.isString(behaviour) ? 'modulePath' : 'serialized',
              context: _.isString(this.contextBehaviour) ? this.contextBehaviour :
                this._serializeBehaviour(this.contextBehaviour),
              contextFormat: _.isString(this.contextBehaviour) ? 'modulePath' : 'serialized',
              config: this.config,
              test: this.options.test,
              debug: this.options.debug,
              parent: {
                id: parent.getId()
              },
              logLevel: this.log.getLevel(),
              additionalRequires: this.options.additionalRequires
            }
          };

          if (this.options.marshallers) {
            var marshallerFormat = 'modulePath';

            createMsg.body.marshallers = _.map(this.options.marshallers, marshaller => {
              if (!_.isString(marshaller)) {
                marshallerFormat = 'serialized';

                return this._serializeBehaviour(marshaller);
              }
              else {
                return marshaller;
              }
            });
            createMsg.body.marshallerFormat = marshallerFormat;
          }

          var actor;

          // Send a message to forked process and await response.
          workerProcess.send(createMsg, (err) => {
            if (err) return reject(err);

            // Wait for response from forked process.
            workerProcess.once('message', (msg) => {
              if (msg.error)
                return reject(new Error(msg.error));

              if (msg.type != 'actor-created' || !msg.body || !msg.body.id)
                return reject(new Error('Unexpected response for "create-actor" message.'));

              actor = new ForkedActorStub(new ForkedActorParent(
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
          });

          // Handle forked process startup failure.
          workerProcess.once('error', err => {
            if (!actor) reject(new Error('Failed to fork: ' + err));
          });

          workerProcess.once('exit', () => {
            if (!actor) return;

            delete this.forkedProcesses[actor.getId()];

            // Actor respawn support.
            if (options.onCrash == 'respawn' && !this.destroying && !actor.isDestroying()) {
              this.log.warn('Actor ' + actor + ' has crashed, respawning...');

              this.createForkedActor(behaviour, parent, _.extend({}, options, { id: actor.getId() }))
                .tap(newActor => newActor.initialize())
                .then(newActor => {
                  this.log.info('Actor ' + actor + ' successfully respawned.');

                  actor.setWrapped(newActor.getWrapped());
                });
            }
            else {
              this.log.info('Actor process exited, actor ' + actor);
            }
          });
        });
      });
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
      .then(rootActor => rootActor.destroy())
      .then(() => {
        if (_.isFunction(this.context.destroy)) {
          return this.context.destroy(this._selfProxy());
        }
      });

    return this.destroyPromise;
  }

  /**
   * Loads actor behaviour from a given module.
   *
   * @param {String} path Actor behaviour module path.
   * @returns {P} Operation promise, which yields an actor behaviour.
   * @private
   */
  _loadBehaviour(path) {
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
   * Determines actor name based on actor behaviour.
   *
   * @param {Object|Function} Behaviour Actor behaviour definition.
   * @returns {String} Actor name or empty string, if actor name is not defined.
   * @private
   */
  _actorName(Behaviour) {
    // Use 'getName' getter, if present.
    if (_.isFunction(Behaviour.getName)) return Behaviour.getName();

    // Take 'actorName' field, if present.
    if (Behaviour.actorName) return _.result(Behaviour, 'actorName');

    // Take 'name' field, if present.
    if (Behaviour.name) return _.result(Behaviour, 'name');

    // Use class name, if present.
    var typeName = this._typeName(Behaviour);

    if (typeName) return typeName;

    if (_.isFunction(Behaviour)) {
      return this._actorName(new Behaviour());
    }

    return '';
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
   * Performs actor resource injection.
   *
   * @param {Function} Behaviour Behaviour class.
   * @returns {*} Behaviour instance with injected resources.
   * @private
   */
  _injectResources(Behaviour) {
    var resourceNames = _.result(Behaviour, 'inject');

    // Resource injection.
    if (_.isArray(resourceNames) && _.isFunction(Behaviour)) {
      // Read resource list.
      var resources = _.map(resourceNames, resourceName => {
        var resource = this._readProperty(this.context, resourceName);

        if (!resource) {
          throw new Error(`Failed to inject resource "${resourceName}" to actor behaviour ${Behaviour}`);
        }

        return resource;
      });

      // Create an instance of actor behaviour, passing resources as constructor arguments.
      return new Behaviour(...resources);
    }

    return new Behaviour();
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
   * @param {Object|Function|Array} behaviour Actor behaviour definition.
   * @returns {String} Serialized actor behaviour.
   * @private
   */
  _serializeBehaviour(behaviour) {
    if (_.isArray(behaviour)) {
      return toSource(_.map(behaviour, item => this._serializeBehaviour(item)));
    }

    if (common.isPlainObject(behaviour)) return toSource(behaviour);

    if (_.isFunction(behaviour)) { // Class-defined behaviour.
      return this._serializeClassBehaviour(behaviour);
    }

    throw new Error('Cannot serialize actor behaviour: ' + behaviour);
  }

  /**
   * Serializes a given class-defined actor behaviour.
   *
   * @param {Function} behaviour Class-defined actor behaviour.
   * @returns {String} Serialized actor behaviour.
   * @private
   */
  _serializeClassBehaviour(behaviour) {
    // Get a base class for behaviour class.
    var base = Object.getPrototypeOf(behaviour);
    var baseBehaviour = '';

    if (base && base.name) {
      // Have a user-defined super class. Serialize it as well.
      baseBehaviour = this._serializeClassBehaviour(base);
    }

    var selfString = behaviour.toString();

    if (s.startsWith(selfString, 'function')) {
      selfString = this._serializeEs5ClassBehaviour(behaviour, selfString, base.name);
    }

    return baseBehaviour + selfString;
  }

  /**
   * Serializes a given ES5 class actor behaviour definition.
   *
   * @param {Function} behaviour Actor behaviour definition in ES5 class form.
   * @param {String} [selfString] Stringified class head.
   * @param {String} [baseName] Base class name.
   * @returns {String} Serialized actor behaviour.
   * @private
   */
  _serializeEs5ClassBehaviour(behaviour, selfString, baseName) {
    var clsName = this._actorName(behaviour);

    if (!clsName) {
      clsName = randomString.generate({
        length: 12,
        charset: 'alphabetic'
      });
    }

    var expressions = [`var ${clsName} = ${selfString || behaviour.toString()};\n`];

    if (baseName) {
      expressions.push(`_inherits(${clsName}, ${baseName});`);
    }

    var staticMemberNames = Object.getOwnPropertyNames(behaviour);

    _.each(staticMemberNames, memberName => {
      if (memberName != 'length' && memberName != 'prototype' && memberName != 'name') {
        expressions.push(`${clsName}.${memberName} = ${behaviour[memberName].toString()};\n`);
      }
    });

    var membersNames = Object.getOwnPropertyNames(behaviour.prototype);

    _.each(membersNames, memberName => {
      if (memberName != 'constructor') {
        expressions.push(`${clsName}.prototype.${memberName} = ${behaviour.prototype[memberName].toString()};\n`);
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
          return this._loadBehaviour(Behaviour);
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