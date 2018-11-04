/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let BalancerActor = require('./balancer-actor.js');
let P = require('bluebird');
let _ = require('underscore');

/**
 * Actor that distributes incoming messages between it's children
 * using round-robin strategy.
 */
class RoundRobinBalancerActor extends BalancerActor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Actor|null} parent Actor parent or null, if it's a root actor.
   * - {String} namePrefix Name prefix for this actor.
   * - {String} mode Clustered actor mode.
   */
  constructor(options) {
    super(_.extend(options, { namePrefix: options.namePrefix + 'RoundRobinBalancer' }));

    this.nextIdx = 0;
  }

  toString() {
    return 'RoundRobinBalancerActor(' + this.getId() + ')';
  }

  _forward(methodName, args) {
    return P.all(this._children())
      .then(children => {
        for (let i = 0; i < children.length; i++) {
          if (this.nextIdx > children.length - 1) {
            this.nextIdx = 0;
          }

          let child = children[this.nextIdx++];

          if (child.getState() == 'ready') {
            return child[methodName].apply(child, args);
          }
        }

        throw new Error('No child to forward message to.');
      });
  }
}

module.exports = RoundRobinBalancerActor;