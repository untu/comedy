/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var common = require('../utils/common.js');
var Actor = require('../actor.js');
var InMemoryActor = require('../in-memory-actor.js');
var P = require('bluebird');
var _ = require('underscore');

/**
 * Balancer actor parent reference, that forwards all messages sent from
 * children to parent actor.
 */
class BalancerActorParentReference extends Actor {
  /**
   *
   * @param {ActorSystem} system Actor system.
   * @param {Actor} parent Parent actor.
   * @param {Actor} actor Self actor.
   */
  constructor(system, parent, actor) {
    super(system, parent, actor.getId(), actor.getName());

    this.parent = parent;
  }

  send(topic, message) {
    return this.parent.send.apply(this.parent, arguments);
  }

  sendAndReceive(topic, message) {
    return this.parent.sendAndReceive.apply(this.parent, arguments);
  }
}

/**
 * Actor that distributes incoming messages between it's children
 * using round-robin strategy.
 */
class RoundRobinBalancerActor extends InMemoryActor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Actor|null} parent Actor parent or null, if it's a root actor.
   * @param {String} namePrefix Name prefix for this actor.
   */
  constructor(system, parent, namePrefix) {
    super(system, parent, {}, namePrefix + 'RoundRobinBalancer');

    this.nextIdx = 0;
    this.parentRef = new BalancerActorParentReference(system, parent, this);
  }

  send0() {
    return this._forward('send', _.toArray(arguments));
  }

  sendAndReceive0() {
    return this._forward('sendAndReceive', _.toArray(arguments));
  }

  metrics() {
    return P.reduce(this._children(), (memo, child) => {
      return child.metrics().then(childMetrics => {
        memo[child.getId()] = childMetrics;

        var flattenedMetrics = common.flatten(childMetrics);

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
    return 'RoundRobinBalancerActor(' + this.getId() + ')';
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
    var childPromises = this._children();

    if (_.isEmpty(childPromises)) {
      return P.resolve().throw(new Error('No children to forward message to.'));
    }

    if (this.nextIdx > childPromises.length - 1) {
      this.nextIdx = 0;
    }

    var currentChildPromise = childPromises[this.nextIdx++];

    return currentChildPromise.then(child => child[methodName].apply(child, args));
  }
}

module.exports = RoundRobinBalancerActor;