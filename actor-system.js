'use strict';

var common = require('../saymon-common.js');
var LocalActor = require('./local-actor.js');
var ForkedActor = require('./forked-actor.js');
var RoundRobinBalancerActor = require('./standard/round-robin-balancer-actor.js');
var log = require('../utils/log.js');
var childProcess = require('child_process');
var appRootPath = require('app-root-path');
var requireDir = require('require-dir');
var toSource = require('tosource');
var mongodb = require('mongodb');
var P = require('bluebird');
var _ = require('underscore');
var globalRequire = require;

/**
 * An actor system.
 */
class ActorSystem {
  constructor(options) {
    options = options || {};

    this.contextBehaviour = options.context || {};

    if (_.isFunction(this.contextBehaviour)) {
      this.context = new this.contextBehaviour();
    }
    else {
      this.context = this.contextBehaviour;
    }

    this.rootActorPromise = P.resolve(new LocalActor(this, null, {}))
      .tap(() => {
        if (_.isFunction(this.context.initialize)) {
          return this.context.initialize(this._selfProxy());
        }
      });
  }

  /**
   * @returns {*} Context of this system.
   */
  getContext() {
    return this.context;
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
    options = options || { mode: 'local' };

    if (options.clusterSize) {
      return P.resolve()
        .then(() => {
          var balancerActor = new RoundRobinBalancerActor(this, parent);

          var childPromises = _.times(options.clusterSize, () =>
            balancerActor.createChild(Behaviour, _.omit(options, 'clusterSize')));

          return P.all(childPromises).return(balancerActor);
        });
    }

    switch (options.mode) {
      case 'local':
        return P.resolve()
          .then(() => {
            var behaviour0 = Behaviour;

            if (_.isFunction(Behaviour)) {
              behaviour0 = new Behaviour();
            }

            return new LocalActor(this, parent, behaviour0);
          })
          .tap(actor => actor.initialize());

      case 'forked':
        return this.createForkedActor(Behaviour, parent);

      default:
        return P.throw(new Error('Unknown actor mode: ' + options.mode));
    }
  }

  /**
   * Creates a forked actor.
   *
   * @param {Object} behaviour Actor behaviour definition.
   * @param {Actor} parent Actor parent.
   * @returns {P} Promise that yields a newly-created actor.
   */
  createForkedActor(behaviour, parent) {
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

            return '--debug-brk=' + (debugPort + 1);
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

              actor = new ForkedActor(this, parent, workerProcess);
              resolve(actor);
            });
          });

          // Handle forked process startup failure.
          workerProcess.once('error', err => {
            if (!actor) reject(new Error('Failed to fork: ' + err));
          });

          // Kill child process if self process is killed.
          process.once('SIGINT', () => {
            log.info('Received SIGINT, exiting');

            process.exit(0);
          });
          process.once('SIGTERM', () => {
            log.info('Received SIGTERM, exiting');

            process.exit(0);
          });
          process.once('exit', () => {
            log.info('Process exiting, killing forked actor ' + actor);

            workerProcess.kill();
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
   * @returns {ActorSystem} Default actor system.
   */
  static default() {
    return defaultSystem;
  }
}

// Default actor system instance.
var defaultSystem = new ActorSystem();

module.exports = ActorSystem;