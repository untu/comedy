/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
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