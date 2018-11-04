/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/**
 * Exports default actor system.
 */

let ActorSystem = require('./lib/actor-system.js');

/**
 * Creates a new actor system with specified options.
 *
 * @param {Object} [options] Actor system options.
 * @returns {ActorSystem} New actor system.
 */
module.exports = function(options) {
  return new ActorSystem(options);
};

// Explicitly-named function alias for creating actor system.
module.exports.createSystem = module.exports;

module.exports.rootActor = function() {
  return ActorSystem.default().rootActor();
};

module.exports.inherits = ActorSystem.inherits;