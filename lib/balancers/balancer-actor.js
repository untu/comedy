/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let common = require('../utils/common.js');
let Actor = require('../actor.js');
let InMemoryActor = require('../in-memory-actor.js');
let jsondiffpatch = require('jsondiffpatch');
let P = require('bluebird');
let _ = require('underscore');

/**
 * Balancer actor parent reference, that forwards all messages sent from
 * children to parent actor.
 */
class BalancerActorParentReference extends Actor {
  /**
   *
   * @param {Object} options Actor creation options.
   * - {ActorSystem} system Actor system.
   * - {Actor} parent Parent actor.
   * - {Actor} actor Self actor.
   */
  constructor(options) {
    super({
      system: options.system,
      parent: options.parent,
      definition: {},
      id: options.actor.getId(),
      name: options.actor.getName()
    });

    this.parent = options.parent;
  }

  getMode() {
    return this.parent.getMode();
  }

  send(topic, message) {
    return this.parent.send.apply(this.parent, arguments);
  }

  sendAndReceive(topic, message) {
    return this.parent.sendAndReceive.apply(this.parent, arguments);
  }
}

/**
 * Abstract actor that distributes incoming messages between it's children.
 */
class BalancerActor extends InMemoryActor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Actor|null} parent Actor parent or null, if it's a root actor.
   * - {String} namePrefix Name prefix for this actor.
   * - {String} mode Clustered actor mode.
   * - {Object} config Actor configuration.
   * - {Object} [definition] Custom definition.
   */
  constructor(options) {
    super({
      system: options.system,
      parent: options.parent,
      definition: options.definition || {},
      name: options.namePrefix,
      config: options.config
    });

    this.parentRef = new BalancerActorParentReference({ system: options.system, parent: options.parent, actor: this });
    this.mode = options.mode;
  }

  initialize() {
    this._setState('ready');
  }

  getMode() {
    return this.mode;
  }

  async changeConfiguration(config = { mode: 'in-memory' }) {
    let oldConfig = this._getConfig();
    let configDiff = jsondiffpatch.diff(oldConfig, config);
    let configDiffKeys = _.keys(configDiff);
    let oldClusterSize = oldConfig.clusterSize;
    let newClusterSize = config.clusterSize;
    let clusterSizeDiff = newClusterSize - oldClusterSize;
    let name = await this._children()[0].then(child => child.getName());

    // Unless only clusterSize has changed, we fall back to super.
    if (configDiffKeys.length != 1 || configDiffKeys[0] != 'clusterSize' || !newClusterSize) {
      return super.changeConfiguration(_.extend({ name }, config));
    }

    if (clusterSizeDiff > 0) { // Scale up.
      let definition = this._getDefinition();
      let childPromises = _.times(clusterSizeDiff, () =>
        this.createChild(definition, _.extend({ name }, config, { clusterSize: 1 })));

      await P.all(childPromises);
    }
    else if (clusterSizeDiff < 0) { // Scale down.
      let children = await P.all(this._children());
      let toDestroy = children.slice(0, Math.abs(clusterSizeDiff));

      await P.map(toDestroy, child => child.destroy());
    }

    this._setConfig(config);

    return this;
  }

  async changeGlobalConfiguration(config) {
    this.getLog().debug('changeGlobalConfiguration(), config=', config);

    let name = await this._children()[0].then(child => child.getName());
    let self = await this.changeConfiguration(config[name]);

    await self.changeGlobalConfigurationForChildren(config);
  }

  async changeGlobalConfigurationForChildren(config) {
    await P.map(this._children(), child => child.changeGlobalConfigurationForChildren(config));
  }

  broadcast(topic, ...message) {
    return P.map(this._children(), child => child.send(topic, ...message));
  }

  broadcastAndReceive(topic, ...message) {
    return P.map(this._children(), child => child.sendAndReceive(topic, ...message));
  }

  send0() {
    return this._forward('send', _.toArray(arguments));
  }

  sendAndReceive0() {
    return this._forward('sendAndReceive', _.toArray(arguments));
  }

  metrics() {
    return P.reduce(this._children(), (memo, child, index) => {
      return child.metrics().then(childMetrics => {
        memo[index] = childMetrics;

        let flattenedMetrics = common.flatten(childMetrics);

        _.each(flattenedMetrics, (value, key) => {
          if (!_.isNumber(value)) return;

          if (!memo.summary[key]) {
            memo.summary[key] = value;
          }
          else {
            memo.summary[key] += value;
          }
        });

        return memo;
      });
    }, { summary: {} });
  }

  toString() {
    return 'BalancerActor(' + this.getId() + ')';
  }

  _parentReference() {
    return this.parentRef;
  }

  /**
   * Forwards message to one of load-balanced children.
   *
   * @param {String} methodName Name of the method to use for sending.
   * @param {Array} args Arguments for send method.
   * @returns {P} Operation promise.
   * @private
   */
  _forward(methodName, args) {
    return common.abstractMethodError('_forward', methodName, args);
  }
}

module.exports = BalancerActor;