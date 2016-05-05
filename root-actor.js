'use strict';

var LocalActor = require('./local-actor.js');

/**
 * A root actor.
 */
class RootActor extends LocalActor {
  constructor(system) {
    super(system, null, {});
  }

  toString() {
    return 'RootActor(' + this.getId() + ')';
  }
}

module.exports = RootActor;