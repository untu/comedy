'use strict';

var Actor = require('./actor.js');

/**
 * An actor system.
 */
class ActorSystem {
  constructor() {
    this.rootActor = new Actor(this, null, {});
  }

  /**
   * @returns {Actor} Root actor for this system.
   */
  getRootActor() {
    return this.rootActor;
  }

  /**
   * @returns {ActorSystem} Default actor system.
   */
  static default() {
    return defaultSystem;
  }
}

// Default actor system instance.
var defaultSystem = new ActorSystem();

module.exports = ActorSystem;