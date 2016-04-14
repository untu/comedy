'use strict';

/**
 * Exports default actor system.
 */

var ActorSystem = require('./actor-system.js');

var defaultSystem = ActorSystem.default();

exports.getRootActor = ActorSystem.prototype.getRootActor.bind(defaultSystem);