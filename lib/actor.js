/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let common = require('./utils/common.js');
let ActorLogger = require('./utils/actor-logger.js');
let ParentActorProxy = require('./parent-actor-proxy.js');
let EventEmitter = require('events').EventEmitter;
let P = require('bluebird');
let _ = require('underscore');

/**
 * A basic actor.
 */
class Actor extends EventEmitter {
  /**
   * @param {Object} options Actor creation options.
   * - {ActorSystem} system Actor system.
   * - {Actor} parent Parent actor.
   * - {Object} definition Actor behaviour definition.
   * - {Object} [origDefinition] Original actor definition.
   * - {String} id Actor ID.
   * - {Object} [config] Actor configuration.
   * - {String} [name] Actor name.
   */
  constructor(options) {
    super();

    this.origDefinition = options.origDefinition || options.definition;

    if (common.isPlainObject(options.definition)) {
      // Plain object behaviour.
      this.definition = _.clone(options.definition);
      this.origDefinition = this.origDefinition || _.clone(options.definition);
    }
    else {
      // Class-defined behaviour.
      this.definition = options.definition;
    }

    this.system = options.system;
    this.parent = options.parent;
    this.id = options.id;
    this.config = options.config || {};
    this.name = options.name || '';
    this.childPromises = [];
    this.forwardList = [];
    this.log = new ActorLogger(options.system.getLog(), this, this.name);
    this.state = 'new';
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
   * @param {Object|Function} definition Child actor behaviour definition. Can be a plain object or a
   * class reference. In case of class reference, an actor object is automatically instantiated.
   * @param {Object} [config] Actor configuration.
   * - {String} mode Actor creation mode.
   * - {Number} clusterSize Number of actor instances to create.
   * - {Object} customParameters Custom actor parameters.
   * @returns {P} Promise that yields a child actor once it is created.
   */
  createChild(definition, config) {
    if (this.getState() != 'new' && this.getState() != 'ready')
      return this._notReadyErrorPromise();

    let log = this.getLog();
    let childPromise = this.system.createActor(definition, this._parentReference(), config)
      .tap(actor => actor.initialize())
      .tap(actor => {
        actor.once('destroyed', () => {
          this.childPromises = _.without(this.childPromises, childPromise);
        });

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
   * Performs a hot configuration change for this actor. Actor remains operational
   * during and after configuration change.
   *
   * @param {Object} config New actor configuration.
   * @returns {Actor} Augmented actor instance.
   */
  async changeConfiguration(config = { mode: 'in-memory' }) {
    if (_.isEqual(_.omit(this.config, 'customParameters'), config)) return this;

    this.getLog()
      .info('Changing actor configuration, currentConfiguration=', this.config, ', newConfiguration=', config);

    let newActor = await this.system._createActor(
      this.origDefinition || this.definition,
      this.parent,
      _.extend({ name: this.getName(), customParameters: this.getCustomParameters() }, config));
    await newActor.initialize();
    await this.parent._augmentChild(this.getId(), newActor);

    this.emit('augmented', newActor);

    this.getLog().info('Actor configuration changed, new actor ID: ' + newActor.getId());

    return newActor;
  }

  /**
   * Recursively applies new global configuration to this actor an all it's
   * child sub-tree.
   *
   * @param {Object} config Global actor configuration.
   */
  async changeGlobalConfiguration(config) {
    this.getLog().debug('changeGlobalConfiguration(), config=', config);

    let self = await this.changeConfiguration(config[this.getName()]);

    await self.changeGlobalConfigurationForChildren(config);
  }

  /**
   * Changes global configuration settings for child actors.
   *
   * @param {Object} config New global configuration.
   */
  async changeGlobalConfigurationForChildren(config) {
    await P.map(this.childPromises, child => child.changeGlobalConfiguration(config));
  }

  /**
   * Checks whether this actors has a parent.
   *
   * @returns {Boolean} TRUE if actor has a parent, FALSE otherwise.
   */
  hasParent() {
    return !!this.parent;
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
   * @returns {ParentActorProxy} This actor's parent reference.
   */
  getParent() {
    return new ParentActorProxy(this.parent);
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
   * Synchronously returns custom actor parameters, if any.
   *
   * @returns {Object|undefined} Custom actor parameters or undefined, if custom parameters
   * were not set.
   */
  getCustomParameters() {
    return _.clone(this.config.customParameters);
  }

  /**
   * Synchronously returns this actor's system.
   *
   * @returns {ActorSystem} Actor system instance.
   */
  getSystem() {
    return this.system;
  }

  /**
   * Synchronously returns this actor's system bus.
   *
   * @returns {SystemBus} Actor system bus.
   */
  getBus() {
    return this.system.bus;
  }

  /**
   * Synchronously returns this actor's mode.
   *
   * @returns {String} Actor mode.
   */
  getMode() {
    return common.abstractMethodError('getMode');
  }

  /**
   * Synchronously returns this actor's state.
   *
   * @returns {String} Actor state.
   */
  getState() {
    return this.state;
  }

  /**
   * Sets new state for this actor.
   *
   * @param {String} newState New actor state.
   * @protected
   */
  _setState(newState) {
    this.state = newState;
  }

  /**
   * Gets current actor configuration.
   *
   * @returns {Object} Actor configuration.
   * @protected
   */
  _getConfig() {
    return this.config;
  }

  /**
   * Saves new actor configuration information. No actual changes are
   * made to actor state.
   *
   * @param {Object} newConfig New actor configuration.
   * @protected
   */
  _setConfig(newConfig) {
    this.config = newConfig;
  }

  /**
   * Gets actor definition.
   *
   * @returns {Object|String} Actor definition.
   * @protected
   */
  _getDefinition() {
    return this.origDefinition;
  }

  /**
   * Sends a message to this actor. The message is handled according to specified behaviour.
   * A result of message handling is completely ignored, even if it has generated an error.
   *
   * @param {String} topic Message topic.
   * @param {*} message Message to send. Variable arguments supported.
   * @returns {P} Promise which is resolved once the message is sent.
   */
  send(topic, ...message) {
    if (this.getState() != 'ready')
      return this._notReadyErrorPromise();

    if (this._checkOverload())
      return this._overloadedErrorPromise();

    let fwActor = this._checkForward(topic);

    if (fwActor) {
      if (this.getLog().isDebug()) {
        this.getLog().debug('Forwarding message to other actor, topic=', topic,
          'message=', JSON.stringify(message, null, 2), 'actor=', fwActor.toString());
      }

      return fwActor.send.apply(fwActor, arguments);
    }

    return this.send0(topic, ...message);
  }

  /**
   * Sends a message to this actor and receives a response. The message is handled according
   * to specified behaviour.
   *
   * @param {String} topic Message topic.
   * @param {*} message Message to send. Variable arguments supported.
   * @returns {P} Promise which yields the actor response, if any.
   */
  sendAndReceive(topic, ...message) {
    if (this.getState() != 'ready')
      return this._notReadyErrorPromise();

    if (this._checkOverload())
      return this._overloadedErrorPromise();

    let fwActor = this._checkForward(topic);

    if (fwActor) {
      if (this.getLog().isDebug()) {
        this.getLog().debug('Forwarding message to other actor, topic=', topic,
          'message=', JSON.stringify(message, null, 2), 'actor=', fwActor.toString());
      }

      return fwActor.sendAndReceive.apply(fwActor, arguments);
    }

    return this.sendAndReceive0(topic, ...message);
  }

  /**
   * Broadcasts a given message to all instances of a clustered actor.
   * For ordinary (non-clustered) actor it's just the same as send().
   *
   * @param {String} topic Message topic.
   * @param {*} message Message to send. Variable arguments supported.
   * @returns {P} Promise which is resolved once the message is sent to all clustered instances.
   */
  broadcast(topic, ...message) {
    return this.send.apply(this, arguments);
  }

  /**
   * Broadcasts a given message to all instances of a clustered actor, and collects results.
   * For ordinary (non-clustered) actor it's just the same as sendAndReceive().
   *
   * @param {String} topic Message topic.
   * @param {*} message Message to send. Variable arguments supported.
   * @returns {P} Promise which yields an array with all clustered actor instance responses.
   */
  broadcastAndReceive(topic, ...message) {
    return this.sendAndReceive.apply(this, arguments).then(result => ([result]));
  }

  /**
   * Sets this actor to forward messages with given topics to it's parent.
   *
   * @param {String|RegExp|Boolean} topics Topic name strings or regular expressions.
   * If true is specified, all unknown message topics will be forwarded to parent.
   */
  forwardToParent(...topics) {
    if (topics.length === 1 && topics[0] === true) {
      this.forwardAllUnknown = this.getParent();

      return;
    }

    if (topics.length === 0) return;

    topics.forEach(topic => {
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

      topics.forEach(topic => {
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
    if (this.destroyPromise)
      return this.destroyPromise;

    this._setState('destroying');

    this.log.debug('Destroying...');

    this.destroyPromise = P
      .map(this.childPromises, child => {
        return child.destroy()
          .catch(err => {
            this.log.warn('Error while destroying child actor, actor=' + child, err);
          });
      })
      .then(() => this.destroy0())
      .then(() => {
        this._setState('destroyed');
        this.emit('destroyed', this);

        this.log.debug('Destroyed.');
      });

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
    let selfObj = {
      id: this.getId(),
      name: this.getName(),
      mode: this.getMode()
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
        let ret = {};

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
   * @param {*} message Message to send.
   * @returns {P} Promise which is resolved once the message is sent.
   */
  send0(topic, ...message) {
    return common.abstractMethodError('send0', topic, message);
  }

  /**
   * Actual sendAndReceive implementation. To be overridden by subclasses.
   *
   * @param {String} topic Message topic.
   * @param {*} message Message to send.
   * @returns {P} Promise which yields the actor response.
   */
  sendAndReceive0(topic, ...message) {
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
   * Augments a child actor with a given ID with the one provided.
   *
   * @param {String} id ID of a child to augment.
   * @param {Actor} newActor New child actor.
   * @private
   */
  async _augmentChild(id, newActor) {
    let children = await P.all(this.childPromises);
    let idx = _.findIndex(children, child => child.getId() == id);

    if (idx < 0) throw new Error(`Failed to find child with ID=${id} during augmentation.`);

    let oldActor = children[idx];
    this.childPromises[idx] = P.resolve(newActor);

    oldActor.destroy().catch(err => {
      this.log.error('Error while destroying augmented actor:', err);
    });
  }

  /**
   * @returns {P} Promise which throws 'not ready' error.
   * @private
   */
  _notReadyErrorPromise() {
    switch (this.getState()) {
      case 'new':
        return P.reject(new Error('Actor has not yet been initialized.'));

      case 'crashed':
        return P.reject(new Error('Actor crashed, no interaction possible.'));

      case 'destroying':
      case 'destroyed':
        return P.reject(new Error('destroy() has been called for this actor, no further interaction possible'));

      default:
        return P.reject(new Error(`Actor cannot accept messages, because it is in "${this.getState()}" state.`));
    }
  }

  /**
   * @returns {P} Promise which throws 'overloaded' error.
   * @private
   */
  _overloadedErrorPromise() {
    return P.reject(new Error('Message was dropped due to system overload.'));
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
    // Forward unknown topic, if configured.
    if (this.forwardAllUnknown && !this.definition[topic]) return this.forwardAllUnknown;

    // Forward topic, if it is present in forward list.
    let fwItem = _.find(this.forwardList, item => {
      let fwTopic = item[0];

      if (fwTopic instanceof RegExp) return topic.match(fwTopic);

      return fwTopic == topic;
    });

    if (fwItem) return fwItem[1];

    return null;
  }

  /**
   * Checks whether a message should be dropped due to system overload.
   * Performs necessary actions if it should.
   *
   * @returns {Boolean} True if message should be dropped, false otherwise.
   * @private
   */
  _checkOverload() {
    if (this.config.dropMessagesOnOverload && this.system.isOverloaded()) {
      this.log.warn('Dropping message due to system overload.');
      this.emit('message-dropped-overload');

      return true;
    }

    return false;
  }
}

module.exports = Actor;
