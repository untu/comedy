/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

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
    super(system, null, null, id, name);
  }
  
  toString() {
    return 'ActorStub(' + this.getId() + ')';
  }
}

module.exports = ActorStub;