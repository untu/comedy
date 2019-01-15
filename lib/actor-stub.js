/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let Actor = require('./actor.js');

/**
 * Actor stub with only ID and name information.
 */
class ActorStub extends Actor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {String} id Actor ID.
   * - {String} [name] Actor name.
   * - {Object} [config] Actor configuration.
   */
  constructor(options) {
    super({
      system: options.system,
      id: options.id,
      name: options.name,
      config: options.config
    });
  }
  
  toString() {
    return 'ActorStub(' + this.getId() + ')';
  }
}

module.exports = ActorStub;