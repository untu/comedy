'use strict';

var Actor = require('./actor.js');
var mongodb = require('mongodb');

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
   * Generates a new ID for an actor.
   *
   * @returns {String} New actor ID.
   */
  generateActorId() {
    return new mongodb.ObjectID().toString();
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