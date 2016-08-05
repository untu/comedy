'use strict';

/**
 * Exports default actor system.
 */

var ActorSystem = require('./actor-system.js');

/**
 * Creates a new actor system with specified options.
 *
 * @param {Object} [options] Actor system options.
 * @returns {ActorSystem} New actor system.
 */
module.exports = function(options) {
  return new ActorSystem(options);
};

module.exports.rootActor = function() {
  return ActorSystem.default().rootActor();
};

module.exports.inherits = ActorSystem.inherits;