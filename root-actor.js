'use strict';

var LocalActor = require('./local-actor.js');
var Logger = require('../utils/logger.js');

/**
 * A root actor.
 */
class RootActor extends LocalActor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Object} [options] Actor options.
   * - {Boolean} [forked] If true - this is a forked root.
   */
  constructor(system, options) {
    super(system, null, {}, 'Root');

    options = options || {};

    this.log = options.forked ? Logger.silent() : system.getLog();
  }

  getLog() {
    return this.log;
  }

  toString() {
    return 'RootActor(' + this.getId() + ')';
  }
}

module.exports = RootActor;