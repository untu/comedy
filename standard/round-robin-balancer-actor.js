'use strict';

var LocalActor = require('../local-actor.js');
var _ = require('underscore');

/**
 * Actor that distributes incoming messages between it's children
 * using round-robin strategy.
 */
class RoundRobinBalancerActor extends LocalActor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Actor|null} parent Actor parent or null, if it's a root actor.
   */
  constructor(system, parent) {
    super(system, parent, {});

    this.nextIdx = 0;
  }

  send0() {
    return this._forward('send', _.toArray(arguments));
  }

  sendAndReceive0() {
    return this._forward('sendAndReceive', _.toArray(arguments));
  }

  toString() {
    return 'RoundRobinBalancerActor(' + this.getId() + ')';
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
    return this._children().then(children => {
      if (_.isEmpty(children)) {
        throw new Error('No children to forward message to.');
      }

      if (this.nextIdx > children.length - 1) {
        this.nextIdx = 0;
      }

      var currentChild = children[this.nextIdx++];

      return currentChild[methodName].apply(currentChild, args);
    });
  }
}

module.exports = RoundRobinBalancerActor;