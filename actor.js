'use strict';

var common = require('../saymon-common.js');
var ActorLogger = require('./utils/actor-logger.js');
var P = require('bluebird');
var _ = require('underscore');

/**
 * A basic actor.
 */
class Actor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Actor} parent Parent actor.
   * @param {String} id Actor ID.
   * @param {String} [name] Actor name.
   */
  constructor(system, parent, id, name) {
    this.system = system;
    this.parent = parent;
    this.id = id;
    this.name = name || '';
    this.childPromises = [];
    this.log = new ActorLogger(system.getLog(), this);
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
    var log = this.getLog();
    var childPromise = this.system.createActor(behaviour, this, options).tap(actor => {
      log.debug('Created child actor ' + actor);

      return actor.initialize();
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
    return this.id;
  }

  /**
   * Synchronously returns this actor's name.
   *
   * @returns {String} This actor's name or empty string, if there is no name for this actor.
   */
  getName() {
    return this.name;
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
   * Synchronously returns a logger for this actor.
   *
   * @returns {ActorLogger} Actor logger.
   */
  getLog() {
    return this.log;
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
   * Sets this actor to forward messages with given topics to it's parent.
   * Topic names can be specified using an array or via varargs.
   */
  forwardToParent() {
    common.abstractMethodError('forwardToParent');
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
   * Returns a JSON tree representation of this actor's hierarchy.
   *
   * @returns {P} Operation promise which yields a hierarchy data object.
   */
  tree() {
    var selfObj = {
      id: this.getId(),
      name: this.name
    };

    return P.resolve()
      .then(() => this.location0())
      .then(location => selfObj.location = location)
      .then(() => this._children())
      .map(child => child.tree())
      .then(childTrees => {
        _.isEmpty(childTrees) || (selfObj.children = childTrees);
      })
      .return(selfObj);
  }

  /**
   * Actual send implementation. To be overridden by subclasses.
   *
   * @param {String} topic Message topic.
   * @param message Message.
   * @returns {P} Promise which is resolved once the message is sent.
   */
  send0(topic, message) {
    return common.abstractMethodError('send0', topic, message);
  }

  /**
   * Actual sendAndReceive implementation. To be overridden by subclasses.
   *
   * @param {String} topic Message topic.
   * @param [message] Message.
   * @returns {P} Promise which yields the actor response.
   */
  sendAndReceive0(topic, message) {
    return common.abstractMethodError('sendAndReceive0', topic, message);
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
   * Returns this actor's location description object.
   *
   * @returns {Object|P} Location description object or a promise returning such object.
   */
  location0() {
    return common.abstractMethodError('location0');
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