/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var net = require('net');
var os = require('os');
var path = require('path');
var fs = require('fs');

var ForkedActor = require('./forked-actor.js');

/**
 * An actor reference target for inter-process communication. Creates a UNIX
 * domain socket and forwards actor messages from this socket to a target actor.
 */
class InterProcessActorReferenceTarget {
  /**
   * @param {Actor} actor Target actor.
   */
  constructor(actor) {
    this.actor = actor;
    this.server = new net.Server();
    this.server.listen(this._getSocketPath(), socket => {
      new ForkedActor(actor.getSystem(), actor.getParent(), socket, actor);
    });
  }

  /**
   * Destroys this reference target, closing all connections and freeing all resources.
   * The target actor is not destroyed.
   */
  destroy() {
    this.server.close(() => {
      fs.unlink(this._getSocketPath());
    });
  }

  /**
   * Converts this reference target to a format, suitable for serialization.
   *
   * @returns {Object} Reference target JSON object.
   */
  toJSON() {
    return { path: this._getSocketPath(), actorId: this.actor.getId() };
  }

  /**
   * @returns {String} Socket file path for this reference.
   * @private
   */
  _getSocketPath() {
    return path.join(os.tmpdir(), 'actor-' + this.actor.getId() + '.socket');
  }
}

module.exports = InterProcessActorReferenceTarget;