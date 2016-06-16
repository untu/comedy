'use strict';

var ForkedActor = require('./forked-actor.js');

/**
 * A forked actor endpoint representing a child process.
 */
class ForkedActorChild extends ForkedActor {
  send0() {
    return this._getActor().send.apply(this._getActor(), arguments);
  }

  sendAndReceive0() {
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