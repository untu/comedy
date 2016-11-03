/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var common = require('./utils/common.js');
var ActorLogger = require('./utils/actor-logger.js');
var ParentActorStub = require('./parent-actor-stub.js');
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
    this.forwardList = [];
    this.destroying = false;
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
    if (this.destroying)
      return this._destroyCalledErrorPromise();
    
    var log = this.getLog();
    var childPromise = this.system.createActor(behaviour, this._parentReference(), options)
      .tap(actor => actor.initialize())
      .tap(actor => {
        log.debug('Created child actor ' + actor);
      })
      .catch(err => {
        this.childPromises = _.without(this.childPromises, childPromise);

        throw err;
      });

    this.childPromises.push(childPromise);

    return childPromise;
  }

  /**
   * Creates one child actor per module in a given directory.
   *
   * @param {String} moduleDir Module directory to read child actor definitions from.
   * @param {Object} [options] Actor creation options, that are passed to each created child actor.
   * @returns {P} Operation promise, which yields initialized child instance array.
   */
  createChildren(moduleDir, options) {
    return P.resolve()
      .then(() => _.keys(this.system.requireDirectory(moduleDir)))
      .map(moduleName => this.createChild(moduleDir + '/' + moduleName, options));
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
   * @returns {ParentActorStub} This actor's parent reference.
   */
  getParent() {
    return new ParentActorStub(this.parent);
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
   * @param {*} message Message.
   * @returns {P} Promise which is resolved once the message is sent.
   */
  send(topic, message) {
    if (this.destroying)
      return this._destroyCalledErrorPromise();

    var fwActor = this._checkForward(topic);
    
    if (fwActor) {
      if (this.getLog().isDebug()) {
        this.getLog().debug('Forwarding message to other actor, topic=', topic,
          'message=', JSON.stringify(message, null, 2), 'actor=', fwActor.toString());
      }

      return fwActor.send.apply(fwActor, arguments);
    }

    // Allow additional arguments.
    if (arguments.length > 2) {
      return this.send0.apply(this, arguments);
    }
    else {
      return this.send0(topic, message); // To avoid IDE warnings.
    }
  }

  /**
   * Sends a message to this actor and receives a response. The message is handled according
   * to specified behaviour.
   *
   * @param {String} topic Message topic.
   * @param {*} [message] Message.
   * @returns {P} Promise which yields the actor response.
   */
  sendAndReceive(topic, message) {
    if (this.destroying)
      return this._destroyCalledErrorPromise();

    var fwActor = this._checkForward(topic);

    if (fwActor) {
      if (this.getLog().isDebug()) {
        this.getLog().debug('Forwarding message to other actor, topic=', topic,
          'message=', JSON.stringify(message, null, 2), 'actor=', fwActor.toString());
      }

      return fwActor.sendAndReceive.apply(fwActor, arguments);
    }

    // Allow additional arguments.
    if (arguments.length > 2) {
      return this.sendAndReceive0.apply(this, arguments);
    }
    else {
      return this.sendAndReceive0(topic, message); // To avoid IDE warnings.
    }
  }

  /**
   * Sets this actor to forward messages with given topics to it's parent.
   *
   * @param {String|RegExp} topics Topic name strings or regular expressions.
   */
  forwardToParent(...topics) {
    if (topics.length === 0) return;

    _.each(topics, topic => {
      this.forwardList.push([topic, this.getParent()]);
    });
  }

  /**
   * Sets this actor to forward messages with given topics to a given child.
   *
   * @param {Actor} childActor Actor to forward messages to.
   * @param {String|RegExp} topics Message topic strings or regular expressions.
   * @returns {P} Operation result promise.
   */
  forwardToChild(childActor, ...topics) {
    return P.all(this.childPromises).then(children => {
      if (!_.contains(children, childActor)) {
        throw new Error('Cannot forward ' + topics + ' messages to ' + childActor +
          ' actor, because it\'s not a child of ' + this + ' actor.');
      }

      _.each(topics, topic => {
        this.forwardList.push([topic, childActor]);
      });
    });
  }

  /**
   * Destroys this actor.
   *
   * @returns {P} Promise which is resolved when actor is destroyed.
   */
  destroy() {
    if (this.destroying)
      return this.destroyPromise;

    this.destroying = true;
    
    this.log.debug('Destroying...');
    
    this.destroyPromise = P.map(this.childPromises, child => child.destroy())
      .then(() => this.destroy0())
      .then(() => this.log.debug('Destroyed.'));

    return this.destroyPromise;
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
   * Returns metrics for this actor and all of it's sub-actor tree.
   *
   * @returns {P} Operation promise, which yields metrics data object.
   */
  metrics() {
    return P.resolve()
      .then(() => this.metrics0())
      .then(selfMetrics => {
        var ret = {};

        if (!_.isEmpty(selfMetrics)) {
          ret = selfMetrics;
        }

        return P.reduce(this._children(), (memo, child) => {
          return child.metrics().then(childMetrics => {
            memo[child.getName()] = childMetrics;

            return memo;
          });
        }, ret);
      });
  }

  /**
   * Actual send implementation. To be overridden by subclasses.
   *
   * @param {String} topic Message topic.
   * @param {*} message Message.
   * @returns {P} Promise which is resolved once the message is sent.
   */
  send0(topic, message) {
    return common.abstractMethodError('send0', topic, message);
  }

  /**
   * Actual sendAndReceive implementation. To be overridden by subclasses.
   *
   * @param {String} topic Message topic.
   * @param {*} [message] Message.
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
   * Returns this actor's metrics data object.
   *
   * @returns {Object|P} Metrics data object or promise returning such object.
   */
  metrics0() {
    return common.abstractMethodError('metrics0');
  }

  /**
   * Returns either a self object, or a proxy object, through which child actors should
   * interact with this actor.
   *
   * @returns {Actor} Self or actor proxy object.
   * @protected
   */
  _parentReference() {
    return this;
  }

  /**
   * Returns child actors for this actor.
   *
   * @returns {P[]} Array with child promises.
   * @protected
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

  /**
   * Checks if actor should forward a message with a given topic to some other actor.
   *
   * @param {String} topic Topic name.
   * @returns {Actor|null} Actor to forward a message with given topic to. If null
   * is returned - no forwarding should occur.
   * @private
   */
  _checkForward(topic) {
    var fwItem = _.find(this.forwardList, item => {
      var fwTopic = item[0];

      if (fwTopic instanceof RegExp) return topic.match(fwTopic);

      return fwTopic == topic;
    });

    if (fwItem) return fwItem[1];

    return null;
  }
}

module.exports = Actor;