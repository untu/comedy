'use strict';

var Actor = require('./actor.js');

/**
 * Actor stub with only ID and name information.
 */
class ActorStub extends Actor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {String} id Actor ID.
   * @param {String} [name] Actor name.
   */
  constructor(system, id, name) {
    super(system, null, id, name);
  }
}

module.exports = ActorStub;