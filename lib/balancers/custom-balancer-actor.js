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
 * using a user-defined strategy.
 */
class CustomBalancerActor extends BalancerActor {
  /**
   * @param {Object} options Actor options.
   * - {Object} definition Actor definition.
   * - {Object} implDefinition Balancer implementation definition.
   * - {ActorSystem} system Actor system.
   * - {Actor|null} parent Actor parent or null, if it's a root actor.
   * - {String} name Balancer name.
   * - {String} mode Clustered actor mode.
   */
  constructor(options) {
    super(_.extend(options, { namePrefix: options.name }));

    this.impl = options.implDefinition;
    this.name = options.name;
    this.lastChildrenState = {};

    if (!this.impl.forward) {
      throw new Error('No "forward" handler defined in balancer definition: ' + this.impl);
    }
  }

  toString() {
    return `${this.name}(${this.getId()})`;
  }

  async _forward(methodName, args) {
    if (!this.childrenById) {
      let children = await P.all(this._children());

      this.childrenById = _.indexBy(children, child => child.getId());
    }

    if (this.impl.clusterChanged) {
      let childrenState = _.reduce(this.childrenById, (memo, child) => {
        memo[child.getId()] = child.getState() == 'ready';

        return memo;
      }, {});

      if (!_.isEqual(this.lastChildrenState, childrenState)) {
        await this.impl.clusterChanged(
          _.chain(this.childrenById)
            .values()
            .filter(child => childrenState[child.getId()])
            .value()
        );
      }

      this.lastChildrenState = childrenState;
    }

    let childId = await P.resolve(this.impl.forward(...args));
    let child = this.childrenById[childId];

    if (!child) {
      throw new Error('No child to forward message to.');
    }

    return child[methodName].apply(child, args);
  }
}

module.exports = CustomBalancerActor;