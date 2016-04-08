'use strict';

var P = require('bluebird');
var _ = require('underscore');

/**
 * A basic actor.
 */
class Actor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Actor|null} parent Actor parent or null, if it's a root actor.
   * @param {Object} behaviour Actor behaviour definition.
   */
  constructor(system, parent, behaviour) {
    this.system = system;
    this.parent = parent;
    this.id = system.generateActorId();
    this.behaviour = _.clone(behaviour);
  }

  /**
   * Creates a child actor.
   *
   * @param {Object} behaviour Child actor behaviour definition.
   * @returns {P} Promise that yields a child actor once it is created.
   */
  createChild(behaviour) {
    return P.resolve(new Actor(this.system, this, behaviour));
  }

  /**
   * Sends a message to this actor. The message is handled according to specified behaviour.
   *
   * @param {String} topic Message topic.
   * @param message Message.
   * @returns {P} Promise which is resolved once the message is sent.
   */
  send(topic, message) {
    return P.bind(this)
      .then(() => {
        var handler = this.behaviour[topic];

        if (handler) {
          if (_.isFunction(handler)) handler.call(this, message);
        }
        else {
          throw new Error('No handler for message, topic=' + topic + ', actor=' + this);
        }
      });
  }

  /**
   * Sends a message to this actor and receives a response. The message is handled according
   * to specified behaviour.
   *
   * @param {String} topic Message topic.
   * @param message Message.
   * @returns {P} Promise which yields the actor response.
   */
  sendAndReceive(topic, message) {
    return P.bind(this)
      .then(() => {
        var handler = this.behaviour[topic];

        if (handler) {
          if (_.isFunction(handler)) return handler.call(this, message);

          return handler;
        }
        else {
          throw new Error('No handler for message, topic=' + topic + ', actor=' + this);
        }
      });
  }

  toString() {
    return 'Actor(' + this.id + ')';
  }
}

module.exports = Actor;