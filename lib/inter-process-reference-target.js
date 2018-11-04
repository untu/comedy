/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let ForkedActor = require('./forked-actor.js');
let MessageSocket = require('./net/message-socket.js');
let common = require('./utils/common.js');
let net = require('net');
let os = require('os');
let path = require('path');
let P = require('bluebird');

/**
 * An actor reference target for inter-process communication. Creates a UNIX
 * domain socket (or Windows named pipe) and forwards actor messages from
 * this socket to a target actor.
 */
class InterProcessActorReferenceTarget {
  /**
   * @param {Actor} actor Target actor.
   */
  constructor(actor) {
    this.actor = actor;
    this.server = new net.Server();
  }

  /**
   * Initializes this reference target.
   *
   * @returns {Promise} Initialization promise.
   */
  initialize() {
    return new P((resolve, reject) => {
      this.server.listen(this._getSocketPath(), err => {
        if (err) return reject(err);

        this.server.on('connection', socket => {
          (new ForkedActor({
            system: this.actor.getSystem(),
            parent: this.actor.getParent(),
            definition: null,
            bus: new MessageSocket(socket),
            actor: this.actor
          })).initialize();
        });

        resolve();
      });
    });
  }

  /**
   * Destroys this reference target, closing all connections and freeing all resources.
   * The target actor is not destroyed.
   *
   * @returns {Promise} Operation promise.
   */
  destroy() {
    return P.fromCallback(cb => this.server.close(cb));
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
    let socketName = 'actor-' + this.actor.getId() + '.socket';

    if (common.isWindows()) {
      return path.join('\\\\?\\pipe', socketName);
    }
    else {
      return path.join(os.tmpdir(), socketName);
    }
  }
}

module.exports = InterProcessActorReferenceTarget;