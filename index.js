'use strict';

/**
 * Exports default actor system.
 */

var ActorSystem = require('./actor-system.js');

var defaultSystem = ActorSystem.default();

/**
 * Creates a new actor system with specified options.
 *
 * @param {Object} options Actor system options.
 * @returns {ActorSystem} New actor system.
 */
module.exports = function(options) {
  return new ActorSystem(options);
};

module.exports.rootActor = ActorSystem.prototype.rootActor.bind(defaultSystem);