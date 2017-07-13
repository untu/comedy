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
    this.client = net.createConnection(socketPath);
    this.actorId = actorId;
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
   * @returns {P} Operation promise.
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
    return new ForkedActorProxy(new ForkedActor(system, null, this.client, new ActorStub(system, this.actorId)));
  }
}

module.exports = InterProcessReferenceSource;