'use strict';

var LocalActor = require('./local-actor.js');
var ForkedActor = require('./forked-actor.js');
var childProcess = require('child_process');
var toSource = require('tosource');
var mongodb = require('mongodb');
var P = require('bluebird');
var _ = require('underscore');

/**
 * An actor system.
 */
class ActorSystem {
  constructor() {
    this.rootActor = new LocalActor(this, null, {});
  }

  /**
   * @returns {Actor} Root actor for this system.
   */
  getRootActor() {
    return this.rootActor;
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
        var workerProcess = childProcess.fork(__dirname + '/forked-actor-worker.js');

        return new P((resolve, reject) => {
          var createMsg = {
            type: 'create-actor',
            body: {
              behaviour: toSource(behaviour),
              parent: {
                id: parent.getId()
              }
            }
          };

          workerProcess.send(createMsg, (err) => {
            if (err) return reject(err);

            // Wait for response from forked process.
            workerProcess.once('message', (msg) => {
              if (msg.error)
                return reject(new Error(msg.error));

              if (msg.type != 'actor-created' || !msg.body || !msg.body.id)
                return reject(new Error('Unexpected response for "create-actor" message.'));

              resolve(new ForkedActor(this, workerProcess));
            });
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
   * @returns {ActorSystem} Default actor system.
   */
  static default() {
    return defaultSystem;
  }
}

// Default actor system instance.
var defaultSystem = new ActorSystem();

module.exports = ActorSystem;