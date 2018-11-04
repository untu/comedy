/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let ForkedActor = require('./forked-actor.js');
let MessageSocket = require('./net/message-socket.js');
let net = require('net');
let P = require('bluebird');

/**
 * An actor reference target for inter-host communication. Opens a TCP
 * socket and forwards actor messages from this socket to a target actor.
 */
class InterHostReferenceTarget {
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
   * @param {ActorSystem} system Actor system.
   * @returns {Promise} Initialization promise.
   */
  initialize(system) {
    return new P((resolve, reject) => {
      this.server.listen(0, '0.0.0.0', err => {
        if (err) return reject(err);

        this.server.on('connection', socket => {
          (new ForkedActor({
            system: this.actor.getSystem(),
            parent: this.actor.getParent(),
            definition: null,
            bus: new MessageSocket(socket),
            actor: this.actor
          })).initialize();

          socket.on('error', err => {
            system.getLog().warn('Inter host reference socket error: ' + err.message);
          });
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
    return {
      host: this.actor.getSystem().getPublicIpAddress(),
      port: this.server.address().port,
      actorId: this.actor.getId()
    };
  }
}

module.exports = InterHostReferenceTarget;