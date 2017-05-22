/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var Actor = require('./actor.js');
var MessageSocket = require('./net/message-socket.js');
var ForkedActorChild = require('./forked-actor-child.js');
var net = require('net');
var P = require('bluebird');

/**
 * Remote actor child endpoint.
 */
class RemoteActorChild extends Actor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Actor} actor Wrapped actor.
   * @param {String} [parentId] Parent ID.
   */
  constructor(system, actor, parentId) {
    super(system, null, actor.getId(), actor.getName(), actor.getCustomParameters());

    this.system = system;
    this.wrappedActor = actor;
    this.parentId = parentId;
  }

  initialize() {
    return new P((resolve, reject) => {
      this.server = net.createServer();
      this.server.listen();

      this.server.on('listening', () => {
        this.log.info('Listening on ' + this.server.address());

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
        this.actorPromise = P.resolve(new ForkedActorChild(this.system, this.socket, this.wrappedActor, this.parentId))
          .tap(actor => actor.initialize());
      });
    });
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
    var actorPromise = this.actorPromise || P.resolve();

    return actorPromise
        .then(actor => actor && actor.destroy())
        .then(() => {
          this.socket && this.socket.end();
          this.server && this.server.close();
        });
  }

  toString() {
    var name = this.getName();

    if (name) {
      return 'RemoteActorChild(' + this.getId() + ', ' + name + ')';
    }
    else {
      return 'RemoteActorChild(' + this.getId() + ')';
    }
  }
}

module.exports = RemoteActorChild;