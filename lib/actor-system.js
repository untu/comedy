/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/* eslint no-path-concat: "off" */

let common = require('./utils/common.js');
let { Logger } = require('./utils/logger.js');
let Actor = require('./actor.js');
let ClientActorProxy = require('./client-actor-proxy.js');
let InMemoryActor = require('./in-memory-actor.js');
let ForkedActorParent = require('./forked-actor-parent.js');
let ForkedActorChild = require('./forked-actor-child.js');
let RemoteActorParent = require('./remote-actor-parent.js');
let RemoteActorChild = require('./remote-actor-child.js');
let ThreadedActorParent = require('./threaded-actor-parent.js');
let ThreadedActorChild = require('./threaded-actor-child.js');
let RootActor = require('./root-actor.js');
let DisabledActor = require('./disabled-actor.js');
let RoundRobinBalancerActor = require('./balancers/round-robin-balancer-actor.js');
let RandomBalancerActor = require('./balancers/random-balancer-actor.js');
let CustomBalancerActor = require('./balancers/custom-balancer-actor.js');
let MessageSocket = require('./net/message-socket.js');
let ForkedActorReferenceMarshaller = require('./marshallers/forked-actor-reference-marshaller.js');
let RemoteActorReferenceMarshaller = require('./marshallers/remote-actor-reference-marshaller.js');
let childProcess = require('child_process');
let appRootPath = require('app-root-path');
let requireDir = require('require-dir');
let toSource = require('tosource');
let bson = require('bson');
let P = require('bluebird');
let _ = require('underscore');
let s = require('underscore.string');
let randomString = require('randomstring');
let globalRequire = require;
let fs = require('fs');
let net = require('net');
let http = require('http');
let os = require('os');
let tooBusy = require('toobusy-js');
let SystemBus = require('./system-bus.js');

P.promisifyAll(fs);

// Default actor system instance reference.
let defaultSystem;

// Default listening port for remote actor system.
const defaultListeningPort = 6161;

/**
 * An actor system.
 */
class ActorSystem {
  /**
   * @param {Object} [options] Actor system options.
   * - {Object} [logger] Custom logger implementation.
   * - {Object} [loggerParams] Custom logger parameters.
   * - {Object} [loggerConfig] Logger level configuration.
   * - {Boolean} [test] If true, sets this system into test mode.
   * - {Boolean} [debug] If true, sets this system into debug mode.
   * - {Boolean} [forceInMemory] If true, all actors will be launched in 'in-memory' mode.
   * - {Object} [root] Root actor behaviour.
   * - {Object} [rootParameters] Root actor custom parameters.
   * - {Object} [rootParametersMarshalledTypes] Value marshalling information for custom parameters.
   * - {Number} [busyLagLimit] Length of event loop lag in milliseconds, after which the system
   * is considered to be busy.
   * - {Array} [marshallers] Custom marshallers.
   * - {Array} [balancers] Custom balancers.
   */
  constructor(options = {}) {
    this.debugPortCounter = 1;
    this.log = common.isPlainObject(options.loggerConfig) ?
      Logger.fromConfigurationObject(options.loggerConfig, 'Default', !options.test || !!options.debug) :
      Logger.fromConfigurationFile(options.loggerConfig);

    if (options.logger) {
      let loggerImpl = this._instantiate(options.logger, options.loggerParams);

      this.log.setImplementation(loggerImpl);
    }

    this.bus = new SystemBus({ log: this.log });
    this.options = _.clone(options);
    this.resourceDefPromises = {};
    this.resourceDefClassesPromise = this._loadResourceDefinitions(options.resources);
    this.marshallers = {};
    this.balancers = {};

    if (options.test) this.log.setLevel(this.log.levels().Silent); // Do not output anything in tests.

    if (options.debug) {
      try {
        P.longStackTraces();
      }
      catch (err) {
        this.log.warn('Failed to enable long stack traces: ' + err);
      }

      this.log.setLevel(this.log.levels().Debug);
    }

    let additionalRequires = this.options.additionalRequires;

    if (additionalRequires) {
      _.isArray(additionalRequires) || (additionalRequires = [additionalRequires]);

      _.each(additionalRequires, path => {
        require(path);
      });
    }

    if (options.root) {
      // Create root with custom behaviour.
      this.rootActorPromise = P.resolve()
        .then(() => {
          if (options.rootActorConfig &&
            options.rootActorConfig.customParameters &&
            options.rootParametersMarshalledTypes) {
            // Un-marshall custom parameters.
            return P
              .reduce(_.pairs(options.rootParametersMarshalledTypes), (memo, kv) => {
                let marshalledType = kv[1];

                if (marshalledType && marshalledType != 'SocketHandle') {
                  let marshaller;

                  if (marshalledType == 'InterProcessReference') {
                    marshaller = this.getForkedActorReferenceMarshaller();
                  }
                  else if (marshalledType == 'InterHostReference') {
                    marshaller = this.getRemoteActorReferenceMarshaller();
                  }
                  else {
                    marshaller = this.marshallers[marshalledType];
                  }

                  if (!marshaller) throw new Error(`Don't know how to un-marshall custom parameter ${kv[0]}`);

                  return marshaller.unmarshall(memo[kv[0]])
                    .then(ref => {
                      memo[kv[0]] = ref;

                      return memo;
                    });
                }

                return memo;
              }, _.clone(options.rootActorConfig.customParameters))
              .then(unmarshalledCustomParameters => {
                return _.extend(options.rootActorConfig, { customParameters: unmarshalledCustomParameters });
              });
          }
          else {
            return options.rootActorConfig;
          }
        })
        .then(actorConfig => this.createActor(options.root, null, _.defaults({
          mode: 'in-memory',
          id: options.rootId,
          name: options.rootName
        }, actorConfig)))
        .then(actorProxy => actorProxy.getWrapped());

      if (options.parent && options.mode) {
        if (options.mode == 'forked') {
          // Create forked root with proper parent.
          this.rootActorPromise = this.rootActorPromise.then(rootActor => {
            let forkedActorChild = new ForkedActorChild({
              system: this,
              bus: process,
              actor: rootActor,
              definition: options.root,
              parentId: options.parent.id
            });

            this.bus.addForkedRecipient(forkedActorChild);

            return forkedActorChild;
          });
        }
        else if (options.mode == 'remote') {
          // Create remote root with proper parent.
          this.rootActorPromise = this.rootActorPromise.then(rootActor => {
            let remoteActorChild = new RemoteActorChild({
              system: this,
              actor: rootActor,
              definition: options.root,
              parentId: options.parent.id
            });

            this.bus.addForkedRecipient(remoteActorChild);

            return remoteActorChild;
          });
        }
        else if (options.mode == 'threaded') {
          // Create threaded root with proper parent.
          this.rootActorPromise = this.rootActorPromise.then(rootActor => {
            let threadedActorChild = new ThreadedActorChild({
              system: this,
              actor: rootActor,
              definition: options.root,
              parentId: options.parent.id
            });

            this.bus.addForkedRecipient(threadedActorChild);

            return threadedActorChild;
          });
        }
        else {
          this.rootActorPromise = P.throw(new Error(`Unknown child system mode: ${options.mode}.`));
        }
      }
    }
    else {
      // Create default root.
      this.rootActorPromise = P.resolve(new RootActor(this, { forked: !!options.forked }));
    }

    // Initialize custom marshallers, if any.
    if (options.marshallers) {
      this.rootActorPromise = this.rootActorPromise.tap(() => this._initializeMarshallers(options.marshallers));
    }

    // Initialize custom balancers, if any.
    if (options.balancers) {
      this.rootActorPromise = this.rootActorPromise.tap(() => this._initializeBalancers(options.balancers));
    }

    this.rootActorPromise = this.rootActorPromise
      .tap(() => this._loadConfiguration(options.config))
      .tap(actor => actor.initialize())
      .tap(() => {
        this.unListenConfig = this._listenConfiguration(options.config);
      });

    // Kill child process if self process is killed.
    this.sigintHandler = () => {
      this.log.info('Received SIGINT, exiting');

      process.exit(0);
    };
    this.sigtermHandler = () => {
      this.log.info('Received SIGTERM, exiting');

      process.exit(0);
    };
    process.once('SIGINT', this.sigintHandler);
    process.once('SIGTERM', this.sigtermHandler);
  }

  /**
   * @returns {*} Logger for this system.
   */
  getLog() {
    return this.log;
  }

  /**
   * @returns {*} Message bus for this system.
   */
  getBus() {
    return this.bus;
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
   * Returns a marshaller for sending actor reference to a forked actor.
   *
   * @returns {ForkedActorReferenceMarshaller} Marshaller instance.
   */
  getForkedActorReferenceMarshaller() {
    let ret = this.forkedActorReferenceMarshaller;

    if (!ret) {
      ret = this.forkedActorReferenceMarshaller = new ForkedActorReferenceMarshaller(this);
      ret.type = 'InterProcessReference';
    }

    return ret;
  }

  /**
   * Returns a marshaller for sending actor reference to a remote actor.
   *
   * @returns {RemoteActorReferenceMarshaller} Marshaller instance.
   */
  getRemoteActorReferenceMarshaller() {
    let ret = this.remoteActorReferenceMarshaller;

    if (!ret) {
      ret = this.remoteActorReferenceMarshaller = new RemoteActorReferenceMarshaller(this);
      ret.type = 'InterHostReference';
    }

    return ret;
  }

  /**
   * Returns actor ping timeout, defined for this system.
   *
   * @returns {Number} Ping timeout in milliseconds.
   */
  getPingTimeout() {
    return this.options.pingTimeout || 15000;
  }

  /**
   * @returns {P} Promise which yields root actor for this system.
   */
  rootActor() {
    return this.rootActorPromise;
  }

  /**
   * Returns actor configuration for given actor name.
   *
   * @param {String} actorName Actor name.
   * @returns {P} Actor configuration object promise.
   */
  actorConfiguration(actorName) {
    return P.resolve(this.config && this.config[actorName] || {});
  }

  /**
   * Creates an actor.
   *
   * @param {Object|String} Definition Actor definition object or module path.
   * @param {Actor} parent Actor parent.
   * @param {Object} [config] Actor persistent configuration options.
   * @returns {*} Promise that yields a created actor reference.
   */
  createActor(Definition, parent, config = {}) {
    return this._createActor(Definition, parent, config).then(actor => {
      return new ClientActorProxy(actor);
    });
  }

  /**
   * Internal method for actually creating an actor.
   *
   * @param {Object|String} Definition Actor definition object or module path.
   * @param {Actor} parent Actor parent.
   * @param {Object} [config] Actor persistent configuration options.
   * @returns {*} Promise that yields a created actor.
   * @private
   */
  _createActor(Definition, parent, config = {}) {
    return P.resolve()
      .then(() => {
        if (_.isString(Definition)) {
          // Module path is specified => load actor module.
          return this._loadDefinition(Definition);
        }

        return Definition;
      })
      .then(Definition0 => {
        let actorName = config.name || this._actorName(Definition0);

        // Determine actor configuration.
        if (this.config && actorName) {
          let actorConfig = this.config[actorName] || this.config[s.decapitalize(actorName)];

          config = _.extend({ mode: 'in-memory' }, actorConfig, config);
        }

        if (this.options.forceInMemory && config.mode != 'in-memory') {
          this.log.warn('Forcing in-memory mode due to forceInMemory flag for actor:', actorName);
          config = _.extend({}, config, { mode: 'in-memory' });
        }

        // Actor creation.
        switch (config.mode || 'in-memory') {
          case 'in-memory':
            return this._createInMemoryActor(Definition, parent, _.defaults({ name: actorName }, config));

          case 'forked':
            return P.resolve(this._createForkedActor(Definition, parent, _.defaults({ name: actorName }, config)));

          case 'remote':
            return P.resolve(this._createRemoteActor(Definition, parent, _.defaults({ name: actorName }, config)));

          case 'threaded':
            return P.resolve(this._createThreadedActor(Definition, parent, _.defaults({ name: actorName }, config)));

          case 'disabled':
            return new DisabledActor({ system: this });

          default:
            return P.resolve().throw(new Error('Unknown actor mode: ' + config.mode));
        }
      });
  }

  /**
   * Starts network port listening, allowing remote actor creation by other systems.
   *
   * @param {Number} [port] Listening port (default is 6161).
   * @param {String} [host] Listening host address (default is all addresses).
   * @returns {P} Promise, which is resolved once server is ready to accept requests or a
   * listening error has occurred.
   */
  listen(port = defaultListeningPort, host) {
    if (!this.serverPromise) {
      this.serverPromise = P.fromCallback(cb => {
        this.server = net.createServer();
        this.server.listen(port, host);

        this.server.on('listening', () => {
          this.log.info(`Listening on ${this.server.address().address}:${this.server.address().port}`);

          cb();
        });
        this.server.on('error', err => {
          this.log.error('Net server error: ' + err.message);

          cb(err);
        });
        this.server.on('connection', socket => {
          let msgSocket = new MessageSocket(socket);

          msgSocket.on('message', msg => {
            if (msg.type != 'create-actor') return;

            let psArgs = [];

            if (msg.body.name) {
              this.log.info(`Creating remote actor ${msg.body.name}`);
              psArgs.push(msg.body.name);
            }
            else {
              this.log.info('Creating remote actor (name unknown)');
            }

            let workerProcess = childProcess.fork(__dirname + '/forked-actor-worker.js', psArgs);

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
   * Returns an IP address of this system's host, through which remote systems can
   * communicate with this one.
   *
   * @returns {String|undefined} Public IP address or undefined, if no such address exists.
   */
  getPublicIpAddress() {
    let ifaces = os.networkInterfaces();
    let result;

    _.some(ifaces, iface => {
      return _.some(iface, part => {
        if (part.internal === false && part.family == 'IPv4') {
          result = part.address;

          return true;
        }
      });
    });

    return result;
  }

  /**
   * Initializes message marshallers.
   *
   * @param {Array} marshallerDefs Marshaller definitions.
   * @returns {P} Initialization promise.
   * @private
   */
  _initializeMarshallers(marshallerDefs) {
    // Validate marshaller array.
    let marshallerTypes = _.countBy(marshallerDefs, marshallerDef => typeof marshallerDef);

    if (_.keys(marshallerTypes).length > 1) {
      return P.reject(new Error('Mixed types in marshallers configuration array are not allowed.'));
    }

    return P
      .reduce(marshallerDefs, (memo, marshallerDef) => {
        return P.resolve()
          .then(() => {
            if (_.isString(marshallerDef)) {
              return this._loadDefinition(marshallerDef);
            }

            return marshallerDef;
          })
          .then(marshallerDef => {
            if (_.isFunction(marshallerDef)) {
              return this._injectResources(marshallerDef);
            }
            else {
              return _.clone(marshallerDef);
            }
          })
          .then(marshallerInstance => {
            let types = this._readProperty(marshallerInstance, 'type');

            _.isArray(types) || (types = [types]);

            _.each(types, type => {
              let typeName = _.isString(type) ? type : this._typeName(type);

              if (!typeName) throw new Error('Failed to determine type name for marshaller: ' + marshallerInstance);

              marshallerInstance.type = typeName;
              memo[typeName] = marshallerInstance;
            });

            return memo;
          });
      }, {})
      .then(marshallers => {
        this.marshallers = marshallers;
      });
  }

  /**
   * Initializes custom balancers.
   *
   * @param {Array} defs Balancer definitions.
   * @returns {P} Initialization promise.
   * @private
   */
  _initializeBalancers(defs) {
    // Validate marshaller array.
    let componentTypes = _.countBy(defs, def => typeof def);

    if (_.keys(componentTypes).length > 1) {
      return P.reject(new Error('Mixed types in balancers configuration array are not allowed.'));
    }

    return P
      .reduce(defs, (memo, def) => {
        return P.resolve()
          .then(() => {
            if (_.isString(def)) {
              return this._loadDefinition(def);
            }

            return def;
          })
          .then(def => {
            let name = this._definitionName(def);

            memo[name] = def;

            return memo;
          });
      }, {})
      .then(balancers => {
        this.balancers = balancers;
      });
  }

  /**
   * Creates a process-local (in-memory) actor.
   *
   * @param {Object|Function} Definition Actor behaviour definition.
   * @param {Actor} parent Actor parent.
   * @param {Object} config Actor configuration.
   * @returns {*} Promise that yields a newly-created actor.
   * @private
   */
  _createInMemoryActor(Definition, parent, config) {
    return P.resolve()
      .then(() => {
        if (_.isString(Definition)) {
          // Module path is specified => load actor module.
          return this._loadDefinition(Definition);
        }

        return Definition;
      })
      .then(definition => {
        if (_.isFunction(definition)) {
          return this._injectResources(definition);
        }

        return definition;
      })
      .then(definition => {
        // Perform clusterization, if needed. We clusterize in-memory actors in test mode only.
        if (this.options.test && config.clusterSize > 1) {
          return this._createBalancerActor(Definition, parent, config)
            .then(balancerActor => {
              let childPromises = _.times(config.clusterSize, () =>
                balancerActor.createChild(definition, _.extend({}, config, { clusterSize: 1 })));

              return P.all(childPromises).return(balancerActor);
            });
        }

        return new InMemoryActor({
          system: this,
          parent: parent,
          definition: definition,
          origDefinition: Definition,
          id: config.id,
          name: config.name,
          config: _.omit(config, 'id', 'name')
        });
      });
  }

  /**
   * Creates a forked actor.
   *
   * @param {Object|String} definition Actor behaviour definition or module path.
   * @param {Actor} parent Actor parent.
   * @param {Object} [config] Actor configuration.
   * @returns {Promise} Promise that yields a newly-created actor.
   * @private
   */
  async _createForkedActor(definition, parent, config = {}) {
    // Perform clusterization, if needed.
    if (config.clusterSize > 1) {
      let balancerActor = await this._createBalancerActor(definition, parent, config);

      let childPromises = _.times(config.clusterSize, () =>
        balancerActor.createChild(definition, _.extend({}, config, { clusterSize: 1 })));

      return P.all(childPromises).return(balancerActor);
    }

    let actor =
      new ForkedActorParent({
        system: this,
        parent: parent,
        definition: definition,
        additionalOptions: config
      });

    this.bus.addForkedRecipient(actor);

    return actor;
  }

  /**
   * Creates a remote actor.
   *
   * @param {Object|String} definition Actor behaviour definition or module path.
   * @param {Actor} parent Actor parent.
   * @param {Object} [config] Actor configuration.
   * @returns {Promise} Promise that yields a newly-created actor.
   * @private
   */
  async _createRemoteActor(definition, parent, config) {
    let host = config.host;
    let cluster = config.cluster;
    let clusterDef;

    if (!host && !cluster)
      throw new Error('Neither "host" nor "cluster" option specified for "remote" mode.');

    if (cluster) {
      clusterDef = this.options.clusters[cluster];

      if (!clusterDef) throw new Error(`Cluster with name "${cluster}" is not defined.`);
    }
    else if (_.isArray(host)) {
      clusterDef = host;
    }
    else if (config.clusterSize > 1) {
      clusterDef = [host];
    }

    // Create clustered actor, if needed.
    if (clusterDef) {
      let balancerActor = await this._createBalancerActor(definition, parent, config);
      let clusterSize = config.clusterSize || clusterDef.length;

      let childPromises = _.times(clusterSize, idx => {
        let hostPort = clusterDef[idx % clusterDef.length];
        let hostPort0 = hostPort.split(':');

        if (hostPort0.length > 1) {
          hostPort0[1] = parseInt(hostPort0[1]);
        }
        else {
          hostPort0.push(defaultListeningPort);
        }

        return balancerActor.createChild(
          definition,
          _.chain(config).omit('cluster').extend({ host: hostPort0[0], port: hostPort0[1], clusterSize: 1 }).value()
        );
      });

      return P.all(childPromises).return(balancerActor);
    }

    let actor = new RemoteActorParent({
      system: this,
      parent: parent,
      definition: definition,
      pingChild: config.onCrash == 'respawn',
      additionalOptions: config
    });

    this.bus.addForkedRecipient(actor);

    return actor;
  }

  /**
   * Creates a threaded actor.
   *
   * @param {Object|String} definition Actor behaviour definition or module path.
   * @param {Actor} parent Actor parent.
   * @param {Object} [config] Actor configuration.
   * @returns {Promise} Promise that yields a newly-created actor.
   * @private
   */
  async _createThreadedActor(definition, parent, config = {}) {
    // Perform clusterization, if needed.
    if (config.clusterSize > 1) {
      let balancerActor = await this._createBalancerActor(definition, parent, config);

      let childPromises = _.times(config.clusterSize, () =>
        balancerActor.createChild(definition, _.extend({}, config, { clusterSize: 1 })));

      return P.all(childPromises).return(balancerActor);
    }

    let actor =
      new ThreadedActorParent({ system: this, parent: parent, definition: definition, additionalOptions: config });

    this.bus.addForkedRecipient(actor);

    return actor;
  }

  /**
   * Creates a balancer actor.
   *
   * @param {Object|String} definition Actor behaviour definition or module path.
   * @param {Actor} parent Parent actor.
   * @param {Object} config Actor configuration.
   * - {String} [balancer] Type of balancer to use.
   * - {String} name Actor name prefix.
   * - {String} mode Child actor mode.
   * @returns {Actor} Balancer actor instance.
   * @private
   */
  async _createBalancerActor(definition, parent, config) {
    let config0 = _.omit(config, 'name');

    if (!config.balancer || config.balancer == 'round-robin') {
      return new RoundRobinBalancerActor({
        system: this,
        parent: parent,
        namePrefix: config.name,
        mode: config.mode,
        definition,
        config: config0
      });
    }
    else if (config.balancer == 'random') {
      return new RandomBalancerActor({
        system: this,
        parent: parent,
        namePrefix: config.name,
        mode: config.mode,
        definition,
        config: config0
      });
    }
    else {
      let balancerDef = this.balancers[config.balancer];

      if (!balancerDef) {
        throw new Error('Unknown balancer implementation: ' + config.balancer);
      }

      let balancerDefInstance = await this._injectResources(balancerDef);
      let balancerName = this._definitionName(balancerDefInstance);
      let balancerInstance = new CustomBalancerActor({
        implDefinition: balancerDefInstance,
        system: this,
        parent: parent,
        mode: config.mode,
        name: balancerName,
        definition,
        config: config0
      });

      await balancerInstance.initialize();

      return balancerInstance;
    }
  }

  /**
   * Generates actor creation message.
   *
   * @param {Object|String} definition Actor behaviour definition or module path.
   * @param {Actor} actor Local endpoint actor.
   * @param {Object} config Actor configuration.
   * - {String} mode Actor mode ('forked' or 'remote').
   * - {String} [name] Actor name.
   * - {Object} [customParameters] Custom actor parameters.
   * @returns {Promise} Actor creation message promise.
   */
  generateActorCreationMessage(definition, actor, config) {
    let createMsg = {
      type: 'create-actor',
      body: {
        id: actor.getId(),
        name: actor.getName(),
        definition: _.isString(definition) ? definition : this._serializeDefinition(definition),
        definitionFormat: _.isString(definition) ? 'modulePath' : 'serialized',
        config: this.config,
        resources: this.options.resources,
        test: this.options.test,
        debug: this.options.debug,
        parent: {
          id: actor.getParent().getId()
        },
        mode: config.mode,
        actorConfig: _.omit(config, 'mode', 'name'),
        loggerConfig: this.options.loggerConfig,
        loggerParams: this.options.loggerParams,
        additionalRequires: this.options.additionalRequires,
        pingTimeout: this.getPingTimeout(),
        clusters: this.options.clusters
      }
    };

    config.name && (createMsg.body.name = config.name);

    if (this.options.marshallers) {
      let marshallerFormat = 'modulePath';

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

    if (this.options.balancers) {
      let balancerFormat = 'modulePath';

      createMsg.body.balancers = _.map(this.options.balancers, balancer => {
        if (!_.isString(balancer)) {
          balancerFormat = 'serialized';

          return this._serializeDefinition(balancer);
        }
        else {
          return balancer;
        }
      });
      createMsg.body.balancerFormat = balancerFormat;
    }

    if (this.options.resources && !_.isString(this.options.resources)) {
      let resourceFormat = [];

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

    if (this.options.logger) {
      if (_.isString(this.options.logger)) {
        createMsg.body.logger = this.options.logger;
        createMsg.body.loggerFormat = 'modulePath';
      }
      else {
        createMsg.body.logger = this._serializeDefinition(this.options.logger);
        createMsg.body.loggerFormat = 'serialized';
      }
    }

    return P.resolve()
      .then(() => {
        if (config.customParameters) {
          let customParametersMarshalledTypes = {};

          return P
            .reduce(_.pairs(config.customParameters), (memo, kv) => {
              let key = kv[0];
              let value = kv[1];

              if (value instanceof ClientActorProxy) {
                value = value.getWrapped();
              }

              if (value instanceof Actor) {
                let marshaller = this.getForkedActorReferenceMarshaller();

                return marshaller.marshall(value)
                  .then(marshalledValue => {
                    memo[key] = marshalledValue;
                    customParametersMarshalledTypes[key] = 'InterProcessReference';
                  })
                  .return(memo);
              }
              else if (value instanceof http.Server || value instanceof net.Server) {
                if (createMsg.socketHandle) throw new Error('Only one socket handle is allowed in custom parameters.');

                createMsg.socketHandle = value;
                customParametersMarshalledTypes[key] = 'SocketHandle';

                memo[key] = value instanceof http.Server ? 'http.Server' : 'net.Server';
              }
              else {
                memo[key] = value;
              }

              return memo;
            }, {})
            .then(customParameters => {
              createMsg.body.actorConfig.customParameters = customParameters;

              if (!_.isEmpty(customParametersMarshalledTypes)) {
                createMsg.body.customParametersMarshalledTypes = customParametersMarshalledTypes;
              }
            });
        }
      })
      .return(createMsg);
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
   * directory. If a module path starts with //, lookup will be made by absolute path.
   * If a module path starts with /, lookup will be made relative to project root.
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
    else if (s.startsWith(modulePath, '//')) {
      return globalRequire(modulePath.substr(common.isWindows() ? 2 : 1));
    }
    else {
      return globalRequire(appRootPath + modulePath);
    }
  }

  /**
   * Imports all modules from a given directory.
   *
   * @param {String} path Directory path. If starts with //, the path will be absolute.
   * If starts with /, the path will be relative to a project directory (the one with package.json file).
   * @returns {Object} Module file name -> loaded module map object.
   */
  requireDirectory(path) {
    let path0 = path;

    if (s.startsWith(path, '//')) {
      path0 = path0.substr(1);
    }
    else if (path0[0] == '/') {
      path0 = appRootPath + path0;
    }

    return requireDir(path0);
  }

  /**
   * Destroys this system. All actors will be destroyed and all destroy hooks will be called.
   *
   * @returns {P} Operation promise.
   */
  destroy() {
    if (this.destroying) return this.destroyPromise;

    this.destroying = true;

    process.removeListener('SIGINT', this.sigintHandler);
    process.removeListener('SIGTERM', this.sigtermHandler);

    this.unListenConfig && this.unListenConfig();

    this.destroyPromise = this.rootActorPromise
      .then(rootActor => rootActor.destroy())
      .catch(_.noop) // Initialization and destruction errors are being logged.
      // Destroy marshallers.
      .then(() => {
        if (this.forkedActorReferenceMarshaller) {
          return this.forkedActorReferenceMarshaller.destroy();
        }
      })
      .then(() => {
        if (this.remoteActorReferenceMarshaller) {
          return this.remoteActorReferenceMarshaller.destroy();
        }
      })
      // Destroy system resources.
      .then(() => {
        return P.map(_.values(this.resourceDefPromises), resource => {
          if (resource && _.isFunction(resource.destroy)) {
            return resource.destroy();
          }
        });
      })
      .then(() => {
        if (this.server) {
          this.server.close();
        }
      })
      .finally(() => {
        if (this.options.mode == 'forked' || this.options.mode == 'remote') {
          this.log.info('Killing forked system process.');

          process.exit();
        }
      });

    return this.destroyPromise;
  }

  /**
   * Checks whether this system is overloaded, i.e. when event loop lag is
   * greater that a configured threshold.
   *
   * @returns {Boolean} True if overloaded, false otherwise.
   */
  isOverloaded() {
    let busyLagLimit = this.options.busyLagLimit;

    if (busyLagLimit <= 0) return false; // If 0 or negative, the system is never busy.

    busyLagLimit = busyLagLimit || 3000; // Take 3 seconds default if not specified.

    return tooBusy.lag() > busyLagLimit;
  }

  /**
   * Loads actor resource definitions.
   *
   * @param {Function[]|String[]|String} resources Array of resource classes or module paths, or a
   * path to a directory with resource modules.
   * @returns {P} Resource definition array promise.
   * @private
   */
  _loadResourceDefinitions(resources) {
    if (!resources) return P.resolve([]);

    if (_.isArray(resources)) {
      return P.map(resources, resource => {
        if (_.isString(resource)) return this._loadDefinition(resource);

        return resource;
      });
    }
    else if (_.isString(resources)) {
      return P.resolve(_.map(this.requireDirectory(resources), module => module.default || module));
    }
    else {
      return P.reject(new Error('Illegal value for "resources" option.'));
    }
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
      let ret = this.require(path);

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
   * @param {String} [nameField] Name of an additional field to use for name resolution.
   * @returns {String} Definition name or empty string, if name is not defined.
   * @private
   */
  _definitionName(Definition, nameField) {
    // Use 'getName' getter, if present.
    if (_.isFunction(Definition.getName)) return Definition.getName();

    // Take name field, if present.
    if (nameField && Definition[nameField]) return _.result(Definition, nameField);

    // Take 'name' field, if present.
    if (Definition.name) return _.result(Definition, 'name');

    // Use class name, if present.
    let typeName = this._typeName(Definition);

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
    let resourceNames = _.result(Definition, 'inject');

    if (resourceNames && !_.isArray(resourceNames)) {
      resourceNames = [resourceNames];
    }

    // Resource injection.
    if (resourceNames && _.isFunction(Definition)) {
      return P
        .map(resourceNames, resourceName => {
          return this._initializeResource(resourceName)
            .then(resourceDef => resourceDef && resourceDef.getResource())
            .tap(resource => {
              if (!resource) {
                throw new Error(
                  `Failed to inject resource "${resourceName}" to actor ${this._actorName(Definition)}, ` +
                  `definition ${Definition}`);
              }
            });
        })
        // Create an instance of actor definition, passing resources as constructor arguments.
        .then(resources => new Definition(...resources));
    }

    return P.resolve(new Definition());
  }

  /**
   * Initializes resource with a given name. An existing resource is returned, if already initialized.
   *
   * @param {String} resourceName Resource name.
   * @param {String[]} [depPath] Resource dependency path for detecting cyclic dependencies.
   * @returns {Promise} Initialized resource definition instance promise. Resolves to undefined,
   * if resource with given name is not found.
   * @private
   */
  _initializeResource(resourceName, depPath) {
    if (this.resourceDefPromises[resourceName]) return this.resourceDefPromises[resourceName];

    depPath = depPath || [resourceName];

    let resourceDefPromise = this.resourceDefClassesPromise
      .then(resourceDefClasses => {
        // Attempt to find a resource definition class.
        let ResourceDefCls = _.find(resourceDefClasses, ResourceDefCls => {
          let resourceName0 = this._resourceName(ResourceDefCls);

          return resourceName0 == resourceName;
        });

        if (ResourceDefCls) {
          let depsPromise = P.resolve([]);

          if (_.isFunction(ResourceDefCls.inject)) {
            depsPromise = P.map(
              ResourceDefCls.inject(),
              resourceDep => {
                let newDepPath = depPath.concat(resourceDep);

                if (_.contains(depPath, resourceDep))
                  throw new Error('Cyclic resource dependency: ' + newDepPath.join('->'));

                return this._initializeResource(resourceDep, newDepPath).then(resourceDef => {
                  if (!resourceDef) throw new Error(`Resource with name ${resourceDep} not found.`);

                  return resourceDef.getResource();
                });
              });
          }

          return depsPromise.then(deps => {
            let resourceInstance = ResourceDefCls;

            if (!common.isPlainObject(ResourceDefCls)) {
              resourceInstance = new ResourceDefCls(...deps);
            }

            if (_.isFunction(resourceInstance.initialize)) {
              return P.resolve(resourceInstance)
                .tap(() => resourceInstance.initialize(this));
            }
            else {
              return resourceInstance;
            }
          });
        }
      });

    this.resourceDefPromises[resourceName] = resourceDefPromise;

    return resourceDefPromise;
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
    let ret = object[propName];

    if (!ret) {
      let getterName = `get${s.capitalize(propName)}`;

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

    throw new Error('Cannot serialize actor definition: ' + def);
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
    let base = Object.getPrototypeOf(def);
    let baseBehaviour = '';

    if (base && base.name) {
      // Have a user-defined super class. Serialize it as well.
      baseBehaviour = this._serializeClassDefinition(base);
    }

    let selfString = def.toString();

    if (s.startsWith(selfString, 'function')) {
      selfString = this._serializeEs5ClassDefinition(def, selfString, base.name);
    }
    else if (s.startsWith(selfString, 'class')) {
      selfString += '; ' + def.name + ';';
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
    let clsName = this._actorName(def);

    if (!clsName) {
      clsName = randomString.generate({
        length: 12,
        charset: 'alphabetic'
      });
    }

    let expressions = [`var ${clsName} = ${selfString || def.toString()};\n`];

    if (baseName) {
      expressions.push(`_inherits(${clsName}, ${baseName});`);
    }

    let staticMemberNames = Object.getOwnPropertyNames(def);

    _.each(staticMemberNames, memberName => {
      if (memberName != 'length' && memberName != 'prototype' && memberName != 'name') {
        expressions.push(`${clsName}.${memberName} = ${def[memberName].toString()};\n`);
      }
    });

    let membersNames = Object.getOwnPropertyNames(def.prototype);

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
   * Loads actor configuration.
   *
   * @param {Object|String} config Actor configuration object or file path.
   * @returns {P} Operation promise.
   * @private
   */
  _loadConfiguration(config) {
    if (_.isObject(config)) {
      this.config = config;

      this.options.mode || this.log.info('Using programmatic actor configuration.');

      return P.resolve();
    }

    // Do not load configuration from file in test mode.
    if (this.options.test) return P.resolve();

    this.config = {};

    let defaultPath = appRootPath + '/actors.json';

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
   * Listens for changes in actor configuration files and applies configuration changes.
   *
   * @param {Object|String} config Actor configuration.
   * @returns {Function|undefined} Un-subscribe function in case of successful subscription.
   * @private
   */
  _listenConfiguration(config) {
    // Only listen to configuration changes in root system.
    if (this.options.parent) return;

    // Do not listen in case of programmatic configuration.
    if (_.isObject(config)) return;

    // Do not listen for config changes in test mode.
    if (this.options.test) return;

    let listener = (cur, prev) => {
      if (_.isEqual(cur, prev)) return;

      this.log.info('Configuration file changed, re-reading configuration...');

      this._loadConfiguration(config)
        .then(() => this.rootActorPromise)
        .then(rootActor => rootActor.changeGlobalConfiguration(this.config))
        .catch(err => {
          this.log.warn('Failed to re-load actor system configuration: ' + err.message);
        });
    };

    let defaultPath = appRootPath + '/actors.json';

    fs.watchFile(defaultPath, listener);

    if (_.isString(config)) {
      fs.watchFile(config, listener);
    }

    return () => {
      fs.unwatchFile(defaultPath, listener);

      if (_.isString(config)) {
        fs.unwatchFile(config, listener);
      }
    };
  }

  /**
   * Instantiates a given item. An item can be a string (in which case it is loaded using require()),
   * a class (in which case it is instantiated with "new"), or an object (in which case it is simply
   * returned).
   *
   * @param {String|Function|Object} Item Item to instantiate.
   * @param {*} [params] Item initialization parameters.
   * @returns {Object} Instantiated object.
   * @private
   */
  _instantiate(Item, params) {
    if (_.isString(Item)) {
      Item = this.require(Item);
    }

    if (_.isFunction(Item)) {
      Item = new Item(params);
    }

    return Item;
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