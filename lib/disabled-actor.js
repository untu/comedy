/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let Actor = require('./actor.js');
let P = require('bluebird');

/**
 * A stub for an actor in "disabled" mode.
 */
class DisabledActor extends Actor {
  constructor(options) {
    super({ system: options.system, definition: {} });
  }

  getMode() {
    return 'disabled';
  }

  send0(topic, ...message) {
    return P.reject(new Error('Cannot send message to a disabled actor.'));
  }

  sendAndReceive0(topic, ...message) {
    return P.reject(new Error('Cannot send message to a disabled actor.'));
  }
}

module.exports = DisabledActor;