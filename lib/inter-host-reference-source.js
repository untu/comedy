/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let ForkedActor = require('./forked-actor.js');
let ClientActorProxy = require('./client-actor-proxy.js');
let ActorStub = require('./actor-stub.js');
let MessageSocket = require('./net/message-socket.js');
let net = require('net');
let P = require('bluebird');

/**
 * An actor reference source for inter-host communication. Connects to a given
 * TCP port and sends messages to a target actor.
 */
class InterHostReferenceSource {
  /**
   * @param {String} host Target host.
   * @param {String} port Target port.
   * @param {String} actorId Target actor ID.
   */
  constructor(host, port, actorId) {
    this.host = host;
    this.port = port;
    this.actorId = actorId;
    this.client = new net.Socket();
  }

  /**
   * Initializes this reference source.
   *
   * @returns {Promise} Initialization promise.
   */
  initialize() {
    return P.fromCallback(cb => {
      this.client.once('error', cb);
      this.client.connect(this.port, this.host, cb);
    });
  }

  /**
   * Creates reference source from a given data transfer object.
   *
   * @param {Object} json Data transfer object.
   * @returns {InterHostReferenceSource} Reference source instance.
   */
  static fromJSON(json) {
    return new InterHostReferenceSource(json.host, json.port, json.actorId);
  }

  /**
   * Destroys this reference source, closing connection and freeing all resources.
   *
   * @returns {Promise} Operation promise.
   */
  destroy() {
    return P.fromCallback(cb => this.client.close(cb));
  }

  /**
   * Converts this reference to an actor proxy instance.
   *
   * @param {ActorSystem} system Actor system.
   * @returns {ClientActorProxy} Actor proxy instance.
   */
  toActorProxy(system) {
    this.client.removeAllListeners('error');

    let actor =
      new ForkedActor({
        system: system,
        bus: new MessageSocket(this.client),
        actor: new ActorStub({
          system: system,
          id: this.actorId
        })
      });

    actor.initialize();

    this.client.on('error', err => {
      system.getLog().warn('Inter host reference error: ' + err.message);
    });

    return new ClientActorProxy(actor);
  }
}

module.exports = InterHostReferenceSource;