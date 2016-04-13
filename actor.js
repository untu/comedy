'use strict';

var common = require('../saymon-common.js');

/**
 * A basic actor.
 */
class Actor {
  /**
   * @param {ActorSystem} system Actor system.
   */
  constructor(system) {
    this.system = system;
  }

  /**
   * Creates a child actor.
   *
   * @param {Object} behaviour Child actor behaviour definition.
   * @param {Object} [options] Actor creation options.
   * - {String} mode Actor creation mode.
   * @returns {P} Promise that yields a child actor once it is created.
   */
  createChild(behaviour, options) {
    return this.system.createActor(behaviour, this, options);
  }

  /**
   * @returns {String} This actor ID.
   */
  getId() {
    return common.abstractMethodError('getId');
  }

  /**
   * Sends a message to this actor. The message is handled according to specified behaviour.
   *
   * @param {String} topic Message topic.
   * @param message Message.
   * @returns {P} Promise which is resolved once the message is sent.
   */
  send(topic, message) {
    return common.abstractMethodError('send', topic, message);
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
    return common.abstractMethodError('sendAndReceive', topic, message);
  }

  /**
   * Destroys this actor.
   *
   * @returns {P} Promise which is resolved when actor is destroyed.
   */
  destroy() {
    return common.abstractMethodError('destroy');
  }

  toString() {
    return 'Actor(' + this.id + ')';
  }
}

module.exports = Actor;