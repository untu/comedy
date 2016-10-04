/*
 * ~ Copyright (c) 2014-2016 ROSSINNO, LTD.
 */

'use strict';

var InMemoryActor = require('./in-memory-actor.js');
var Logger = require('./utils/logger.js');
var ActorLogger = require('./utils/actor-logger.js');

/**
 * A root actor.
 */
class RootActor extends InMemoryActor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Object} [options] Actor options.
   * - {Boolean} [forked] If true - this is a forked root.
   */
  constructor(system, options) {
    super(system, null, {}, 'Root');

    options = options || {};

    this.log = options.forked ? Logger.silent() : new ActorLogger(system.getLog(), this);
  }

  getLog() {
    return this.log;
  }

  toString() {
    return 'RootActor(' + this.getId() + ')';
  }
}

module.exports = RootActor;