/*
 * ~ Copyright (c) 2014-2016 ROSSINNO, LTD.
 */

'use strict';

/**
 * Exports default actor system.
 */

var ActorSystem = require('./lib/actor-system.js');

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