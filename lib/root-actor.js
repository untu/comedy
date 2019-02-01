/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let InMemoryActor = require('./in-memory-actor.js');
let { Logger } = require('./utils/logger.js');
let ActorLogger = require('./utils/actor-logger.js');

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
    super({ system: system, definition: {}, name: 'Root' });

    options = options || {};

    this.log = options.forked ? Logger.silent() : new ActorLogger(system.getLog(), this);
    this.state = 'ready';
  }

  changeConfiguration(config) {
    // Root actor configuration never changes.
    return Promise.resolve(this);
  }

  getLog() {
    return this.log;
  }

  toString() {
    return 'RootActor(' + this.getId() + ')';
  }
}

module.exports = RootActor;