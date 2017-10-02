/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var ForkedActor = require('./forked-actor.js');
var ForkedActorProxy = require('./forked-actor-proxy.js');
var ActorStub = require('./actor-stub.js');
var MessageSocket = require('./net/message-socket.js');
var net = require('net');
var P = require('bluebird');

/**
 * An actor reference source for inter-process communication. Connects to a given
 * UNIX domain socket and sends messages to a target actor.
 */
class InterProcessReferenceSource {
  /**
   * @param {String} socketPath Path to a reference socket file.
   * @param {String} actorId Target actor ID.
   */
  constructor(socketPath, actorId) {
    this.socketPath = socketPath;
    this.actorId = actorId;
    this.client = new net.Socket();
  }

  /**
   * Initializes this reference source.
   *
   * @returns {Promise} Initialization promise.
   */
  initialize() {
    return new P((resolve, reject) => {
      this.client.connect(this.socketPath, resolve);
    });
  }

  /**
   * Creates reference source from a given data transfer object.
   *
   * @param {Object} json Data transfer object.
   * @returns {InterProcessReferenceSource} Reference source instance.
   */
  static fromJSON(json) {
    return new InterProcessReferenceSource(json.path, json.actorId);
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
   * @returns {ForkedActorProxy} Actor proxy instance.
   */
  toActorProxy(system) {
    var actor =
      new ForkedActor({
        system: system,
        bus: new MessageSocket(this.client),
        actor: new ActorStub({
          system: system,
          id: this.actorId
        })
      });

    actor.initialize();

    return new ForkedActorProxy(actor);
  }
}

module.exports = InterProcessReferenceSource;