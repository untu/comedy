'use strict';

/* eslint no-path-concat: "off" */

var common = require('../saymon-common.js');
var Logger = require('../utils/logger.js');
var InMemoryActor = require('./in-memory-actor.js');
var ForkedActor = require('./forked-actor.js');
var ForkedActorParent = require('./forked-actor-parent.js');
var ForkedActorChild = require('./forked-actor-child.js');
var RootActor = require('./root-actor.js');
var ActorStub = require('./actor-stub.js');
var RoundRobinBalancerActor = require('./standard/round-robin-balancer-actor.js');
var childProcess = require('child_process');
var appRootPath = require('app-root-path');
var requireDir = require('require-dir');
var toSource = require('tosource');
var mongodb = require('mongodb');
var P = require('bluebird');
var _ = require('underscore');
var s = require('underscore.string');
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
   * - {Object} [root] Root actor behaviour.
   */
  constructor(options) {
    options = options || {};

    this.contextBehaviour = options.context || {};
    this.marshallers = {};

    if (_.isFunction(this.contextBehaviour)) {
      this.context = new this.contextBehaviour(); // eslint-disable-line
    }
    else {
      this.context = this.contextBehaviour;
    }

    this.debugPortCounter = 1;
    this.log = options.log || new Logger();
    this.options = _.clone(options);
    
    if (options.test) this.log.setLevel(this.log.levels().Error); // Only output errors in tests.
    
    if (options.debug) this.log.setLevel(this.log.levels().Debug); // Overrides test option.

    // Initialize marshallers.
    if (this.context.marshallers) {
      this.marshallers = _.reduce(this.context.marshallers, (memo, marshaller) => {
        var type = this._readProperty(marshaller, 'type');
        var typeName = this._typeName(type);

        memo[typeName] = marshaller;

        return memo;
      }, {});
    }

    var initRet = _.isFunction(this.context.initialize) && this.context.initialize(this._selfProxy());
    var contextPromise = P.resolve().then(() => initRet);

    if (options.root) {
      // Create root with custom behaviour.
      this.rootActorPromise = contextPromise.then(() => this.createActor(options.root, null, { mode: 'in-memory' }));

      if (options.forked) {
        // Create forked root with proper parent.
        this.rootActorPromise = this.rootActorPromise.then(rootActor => {
          return new ForkedActorChild(
            this,
            new ForkedActor(this, null, process, new ActorStub(this, options.forked.id)),
            process,
            rootActor);
        });
      }
    }
    else {
      // Create default root.
      this.rootActorPromise = contextPromise.return(new RootActor(this, { forked: !!options.forked }));
    }
    
    this.rootActorPromise = this.rootActorPromise
      .tap(() => this._loadConfiguration(options.config))
      .tap(actor => actor.initialize());
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
   * @param {Object} Behaviour Actor behaviour.
   * @param {Actor} parent Actor parent.
   * @param {Object} [options] Actor creation options.
   * @returns {*} Promise that yields a created actor.
   */
  createActor(Behaviour, parent, options) {
    options = options || {};

    var actorName = this._actorName(Behaviour);

    // Determine actor configuration.
    if (this.config && actorName) {
      var actorConfig = this.config[s.decapitalize(actorName)];

      options = _.extend({ mode: 'in-memory' }, actorConfig, options);
    }

    // Perform clusterization, if needed.
    if (options.clusterSize > 1) {
      return P.resolve()
        .then(() => {
          var balancerActor = new RoundRobinBalancerActor(this, parent);

          var childPromises = _.times(options.clusterSize, () =>
            balancerActor.createChild(Behaviour, _.extend({}, options, { clusterSize: 1 })));

          return P.all(childPromises).return(balancerActor);
        });
    }
    
    if (this.options.debug && options.mode != 'in-memory') {
      this.log.warn('Forcing in-memory mode due to debug flag for actor:', actorName);
      options = _.extend({}, options, { mode: 'in-memory' });
    }

    // Actor creation.
    switch (options.mode || 'in-memory') {
      case 'in-memory':
        return this.createInMemoryActor(Behaviour, parent, actorName);

      case 'forked':
        return this.createForkedActor(Behaviour, parent, actorName);

      default:
        return P.resolve().throw(new Error('Unknown actor mode: ' + options.mode));
    }
  }

  /**
   * Creates a process-local (in-memory) actor.
   *
   * @param {Object|Function} Behaviour Actor behaviour definition.
   * @param {Actor} parent Actor parent.
   * @param {String} [actorName] Actor name.
   * @returns {*} Promise that yields a newly-created actor.
   */
  createInMemoryActor(Behaviour, parent, actorName) {
    return P.resolve()
      .then(() => {
        var behaviour0 = Behaviour;

        if (_.isFunction(Behaviour)) {
          behaviour0 = this._injectResources(Behaviour);
        }

        return new InMemoryActor(this, parent, behaviour0, actorName);
      });
  }

  /**
   * Creates a forked actor.
   *
   * @param {Object} behaviour Actor behaviour definition.
   * @param {Actor} parent Actor parent.
   * @param {String} [actorName] Actor name.
   * @returns {P} Promise that yields a newly-created actor.
   */
  createForkedActor(behaviour, parent, actorName) {
    return P.resolve()
      .then(() => {
        var psArgs = [];

        if (_.isFunction(behaviour) && behaviour.name) {
          psArgs.push(behaviour.name);
        }

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
              behaviour: this._serializeBehaviour(behaviour),
              context: this._serializeBehaviour(this.contextBehaviour),
              config: this.config,
              test: this.options.test,
              debug: this.options.debug,
              parent: {
                id: parent.getId()
              }
            }
          };
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

              actor = new ForkedActorParent(
                this,
                parent,
                workerProcess,
                msg.body.id,
                actorName);

              resolve(actor);
            });
          });

          // Handle forked process startup failure.
          workerProcess.once('error', err => {
            if (!actor) reject(new Error('Failed to fork: ' + err));
          });

          // Kill child process if self process is killed.
          process.once('SIGINT', () => {
            this.log.info('Received SIGINT, exiting');

            process.exit(0);
          });
          process.once('SIGTERM', () => {
            this.log.info('Received SIGTERM, exiting');

            process.exit(0);
          });
          process.once('exit', () => {
            if (actor) {
              this.log.debug('Process exiting, killing forked actor ' + actor);

              workerProcess.kill();
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
    return new mongodb.ObjectID().toString();
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
      return requireDir(appRootPath + modulePath);
    }
    else {
      return globalRequire(appRootPath + modulePath);
    }
  }

  /**
   * Destroys this system. All actors will be destroyed and context destroy hook will be called.
   *
   * @returns {P} Operation promise.
   */
  destroy() {
    return this.rootActorPromise
      .then(rootActor => rootActor.destroy())
      .then(() => {
        if (_.isFunction(this.context.destroy)) {
          return this.context.destroy(this._selfProxy());
        }
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
    // Take 'name' field, if present.
    if (Behaviour.name) return _.result(Behaviour, 'name');

    // Use 'getName' getter, if present.
    if (_.isFunction(Behaviour.getName)) return Behaviour.getName();

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
    if (type.constructor && type.constructor.name) {
      return type.constructor.name;
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
        var getterName = resourceName;

        if (!_.isFunction(this.context[getterName])) {
          getterName = `get${s.capitalize(resourceName)}`;
        }

        if (!_.isFunction(this.context[getterName])) {
          throw new Error(`Failed to inject resource "${resourceName}" to actor behaviour ${Behaviour}`);
        }

        return this.context[getterName]();
      });

      // Create an instance of actor behaviour, passing resources as constructor arguments.
      return new Behaviour(...resources);
    }

    return new Behaviour();
  }

  /**
   * Serializes a given actor behaviour definition for transferring to other process.
   *
   * @param {Object|Function} behaviour Actor behaviour definition.
   * @returns {String} Serialized actor behaviour.
   * @private
   */
  _serializeBehaviour(behaviour) {
    if (!common.isPlainObject(behaviour)) {
      // Assume from this point that behaviour is a class.
      // Get a base class for behaviour class.
      var base = Object.getPrototypeOf(behaviour);

      if (base && base.name) {
        // Have a user-defined super class. Serialize it as well.
        return this._serializeBehaviour(base) + toSource(behaviour);
      }
    }

    return toSource(behaviour);
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
      require: this.require.bind(this)
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

      this.options.forked || this.log.info('Using programmatic actor configuration.');

      return P.resolve();
    }

    // Do not load configuration from file in test mode.
    if (this.options.test) return P.resolve();

    var defaultPath = appRootPath + '/actors.json';

    if (_.isString(config)) {
      // Config path specified => read from FS.
      return fs.readFileAsync(config)
        .then(data => {
          this.config = JSON.parse(data);

          this.log.info('Using actor configuration file: ' + config);
        })
        .catch(() => {
          this.log.info(
            'Failed to load actor configuration file ' + config + ', will try default path: ' + defaultPath);

          return this._loadConfiguration();
        });
    }

    return fs.readFileAsync(defaultPath)
      .then(data => {
        this.config = JSON.parse(data);

        this.log.info('Using actor configuration file: ' + defaultPath);
      })
      .catch(() => {
        this.log.info(
          'Failed to load actor configuration file ' + defaultPath + ', no actor configuration will be used.');
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
}

module.exports = ActorSystem;