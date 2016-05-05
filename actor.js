'use strict';

var common = require('../saymon-common.js');
var P = require('bluebird');
var _ = require('underscore');

/**
 * A basic actor.
 */
class Actor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Actor} parent Parent actor.
   */
  constructor(system, parent) {
    this.system = system;
    this.parent = parent;
    this.childPromises = [];
  }

  /**
   * Actor initialization function that is called before any interaction with actor starts.
   * This function may return promise, in which case the actor will only be available for
   * communication after the returned promise is resolved.
   */
  initialize() {
  }

  /**
   * Creates a child actor.
   *
   * @param {Object|Function} behaviour Child actor behaviour definition. Can be a plain object or a
   * class reference. In case of class reference, an actor object is automatically instantiated.
   * @param {Object} [options] Actor creation options.
   * - {String} mode Actor creation mode.
   * @returns {P} Promise that yields a child actor once it is created.
   */
  createChild(behaviour, options) {
    var childPromise = this.system.createActor(behaviour, this, options).then(actor => {
      this.system.getLog().info(this.toString() + ' created child actor ' + actor);

      return actor;
    });

    this.childPromises.push(childPromise);

    return childPromise;
  }

  /**
   * Synchronously returns this actor's ID.
   *
   * @returns {String} This actor ID.
   */
  getId() {
    return common.abstractMethodError('getId');
  }

  /**
   * Synchronously returns this actor's context.
   *
   * @returns {*} A context of this actor's system.
   */
  getContext() {
    return this.system.getContext();
  }

  /**
   * Synchronously returns this actor's parent.
   *
   * @returns {Actor} This actor's parent.
   */
  getParent() {
    return this.parent;
  }

  /**
   * Sends a message to this actor. The message is handled according to specified behaviour.
   * A result of message handling is completely ignored, even if it has generated an error.
   *
   * @param {String} topic Message topic.
   * @param message Message.
   * @returns {P} Promise which is resolved once the message is sent.
   */
  send(topic, message) {
    if (this.destroying)
      return this._destroyCalledErrorPromise();

    // Allow additional arguments.
    if (arguments.length > 2) {
      return this.send0.apply(this, arguments);
    }
    else {
      return this.send0(topic, message);
    }
  }

  /**
   * Sends a message to this actor and receives a response. The message is handled according
   * to specified behaviour.
   *
   * @param {String} topic Message topic.
   * @param [message] Message.
   * @returns {P} Promise which yields the actor response.
   */
  sendAndReceive(topic, message) {
    if (this.destroying)
      return this._destroyCalledErrorPromise();

    // Allow additional arguments.
    if (arguments.length > 2) {
      return this.sendAndReceive0.apply(this, arguments);
    }
    else {
      return this.sendAndReceive0(topic, message);
    }
  }

  /**
   * Destroys this actor.
   *
   * @returns {P} Promise which is resolved when actor is destroyed.
   */
  destroy() {
    if (this.destroying)
      return this._destroyCalledErrorPromise();

    this.destroying = true;

    return this.destroy0();
  }

  /**
   * Helper function to correctly import modules in different processes with
   * different directory layout.
   *
   * @param {String} modulePath Path of the module to import. If starts with /, a module
   * is searched relative to project directory.
   * @returns {*} Module import result.
   */
  require(modulePath) {
    return this.system.require(modulePath);
  }

  /**
   * Actual send implementation. To be overridden by subclasses.
   *
   * @param {String} topic Message topic.
   * @param message Message.
   * @returns {P} Promise which is resolved once the message is sent.
   */
  send0(topic, message) {
    return common.abstractMethodError('send', topic, message);
  }

  /**
   * Actual sendAndReceive implementation. To be overridden by subclasses.
   *
   * @param {String} topic Message topic.
   * @param [message] Message.
   * @returns {P} Promise which yields the actor response.
   */
  sendAndReceive0(topic, message) {
    return common.abstractMethodError('sendAndReceive', topic, message);
  }

  /**
   * Actual destroy implementation. To be overridden by subclasses.
   *
   * @returns {P} Promise which is resolved when actor is destroyed.
   */
  destroy0() {
    return P.resolve();
  }

  /**
   * Returns child actors for this actor.
   *
   * @returns {P[]} Array with child promises.
   * @private
   */
  _children() {
    return _.clone(this.childPromises);
  }

  toString() {
    return 'Actor(' + this.id + ')';
  }

  /**
   * @returns {P} Promise which throws 'destroy() called' error.
   * @private
   */
  _destroyCalledErrorPromise() {
    return P.resolve().throw(new Error('destroy() has been called for this actor, no further interaction possible'));
  }
}

module.exports = Actor;