'use strict';

var ForkedActor = require('./forked-actor.js');
var _ = require('underscore');

/**
 * A forked actor endpoint representing a child process.
 */
class ForkedActorChild extends ForkedActor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Actor} parent Parent actor.
   * @param {Object} bus Message bus to send/receive messages.
   * @param {Actor} actor Wrapped actor.
   */
  constructor(system, parent, bus, actor) {
    super(system, parent, bus, actor);

    this.forwardList = [];
  }

  forwardToParent() {
    if (arguments.length === 0) return;

    var args = arguments[0];

    if (arguments.length > 1) {
      args = _.toArray(arguments);
    }
    else if (!_.isArray(arguments[0])) {
      args = [arguments[0]];
    }

    this.forwardList.push.apply(this.forwardList, args);
  }

  send0(topic, message) {
    if (_.contains(this.forwardList, topic)) {
      this.getLog().debug('Forwarding message to parent, topic=', topic, 'message=', message);

      return this.getParent().send.apply(this.getParent(), arguments);
    }

    return this._getActor().send.apply(this._getActor(), arguments);
  }

  sendAndReceive0(topic, message) {
    if (_.contains(this.forwardList, topic)) {
      this.getLog().debug('Forwarding message to parent, topic=', topic, 'message=', message);

      return this.getParent().sendAndReceive.apply(this.getParent(), arguments);
    }

    return this._getActor().sendAndReceive.apply(this._getActor(), arguments);
  }

  location0() {
    return this._getActor().location0();
  }

  toString() {
    var name = this.getName();

    if (name) {
      return 'ForkedActorChild(' + this.getId() + ', ' + name + ')';
    }
    else {
      return 'ForkedActorChild(' + this.getId() + ')';
    }
  }
}

module.exports = ForkedActorChild;