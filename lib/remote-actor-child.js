/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let Actor = require('./actor.js');
let MessageSocket = require('./net/message-socket.js');
let ForkedActorChild = require('./forked-actor-child.js');
let net = require('net');
let P = require('bluebird');

/**
 * Actor class for handling remote requests.
 */
class RemoteActorChildProxy extends ForkedActorChild {
  getMode() {
    return 'remote';
  }
}

/**
 * Remote actor child endpoint.
 */
class RemoteActorChild extends Actor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Actor} actor Wrapped actor.
   * - {Object} definition Actor behaviour definition.
   * - {String} [parentId] Parent ID.
   */
  constructor(options) {
    super({
      system: options.system,
      parent: null,
      definition: options.definition,
      id: options.actor.getId(),
      name: options.actor.getName(),
      customParameters: options.actor.getCustomParameters()
    });

    this.system = options.system;
    this.wrappedActor = options.actor;
    this.parentId = options.parentId;
    this.definition = options.definition;
  }

  initialize() {
    return new P((resolve, reject) => {
      this.server = net.createServer();
      this.server.listen();

      this.server.on('listening', () => {
        let addr = this.server.address();
        this.log.info(`Listening on ${addr.address}:${addr.port}`);

        resolve();
      });
      this.server.on('error', err => {
        this.log.error('Net server error: ' + err.message);

        reject(err);
      });
      this.server.on('connection', socket => {
        if (this.socket) {
          // Already have connection, reject.
          this.log.warn('Second incoming connection, rejecting:', socket.address());

          return socket.end();
        }

        this.socket = new MessageSocket(socket);
        this.actorPromise = P
          .resolve(new RemoteActorChildProxy({
            system: this.system,
            bus: this.socket,
            actor: this.wrappedActor,
            definition: this.definition,
            parentId: this.parentId
          }))
          .tap(actor => actor.initialize());
      });
    });
  }

  getMode() {
    return 'remote';
  }

  /**
   * Synchronously returns this actor's listening port, provided that the actor
   * is initialized.
   *
   * @returns {Number} Listening port number.
   */
  getPort() {
    if (!this.server) throw new Error('Remote actor not initialized yet.');

    return this.server.address().port;
  }

  send0(...args) {
    if (!this.actorPromise) return P.reject(new Error('Network connection has not been established yet.'));

    return this.actorPromise.then(actor => actor.send(...args));
  }

  sendAndReceive0(...args) {
    if (!this.actorPromise) return P.reject(new Error('Network connection has not been established yet.'));

    return this.actorPromise.then(actor => actor.sendAndReceive(...args));
  }

  destroy0() {
    let actorPromise = this.actorPromise || P.resolve();

    return actorPromise
      .then(actor => actor && actor.destroy())
      .then(() => {
        this.socket && this.socket.end();
        this.server && this.server.close();
      });
  }

  /**
   * Transmits bus message through this actor's system bus instance.
   *
   * @param {String} event Event name.
   * @param {String[]} senders Chain of actors (ID's) who sent that message.
   * @param {any} args Emission arguments.
   */
  transmitBusMessage(event, senders = [], ...args) {
    this.actorPromise.then(actor => actor.transmitBusMessage(event, senders, ...args));
  }

  toString() {
    let name = this.getName();

    if (name) {
      return 'RemoteActorChild(' + this.getId() + ', ' + name + ')';
    }
    else {
      return 'RemoteActorChild(' + this.getId() + ')';
    }
  }
}

module.exports = RemoteActorChild;