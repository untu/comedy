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
   * @returns {ForkedActorProxy} Actor proxy instance.
   */
  toActorProxy(system) {
    this.client.removeAllListeners('error');

    var actor = new ForkedActor(system, null, new MessageSocket(this.client), new ActorStub(system, this.actorId));

    actor.initialize();

    this.client.on('error', err => {
      system.getLog().warn('Inter host reference error: ' + err.message);
    });

    return new ForkedActorProxy(actor);
  }
}

module.exports = InterHostReferenceSource;