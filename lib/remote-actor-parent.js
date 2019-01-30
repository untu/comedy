/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let ForkedActor = require('./forked-actor.js');
let ActorStub = require('./actor-stub.js');
let MessageSocket = require('./net/message-socket.js');
let EventEmitter = require('events').EventEmitter;
let common = require('./utils/common.js');
let net = require('net');
let _ = require('underscore');
let P = require('bluebird');

// Default listening port for remote actor system.
const defaultListeningPort = 6161;

/**
 * Represents a parent (originator) process endpoint of a remote actor.
 */
class RemoteActorParent extends ForkedActor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Actor} parent Parent actor.
   * - {Object} definition Actor behaviour definition.
   * - {String} id Actor ID.
   * - {String} name Actor name.
   * - {Boolean} pingChild Whether to ping child actor.
   * - {Object} [additionalOptions] Additional actor options.
   */
  constructor(options) {
    let name = options.additionalOptions && options.additionalOptions.name;
    let id = options.system.generateActorId();

    super({
      system: options.system,
      parent: options.parent,
      definition: options.definition,
      actor: new ActorStub({
        system: options.system,
        id: id,
        name: name
      }),
      config: _.omit(options.additionalOptions || {}, 'id', 'name')
    });

    this.definition = options.definition;
    this.additionalOptions = options.additionalOptions || {};

    if (options.pingChild) {
      this._monitorChild();
    }
  }

  initialize() {
    return this._createRemoteWorker().tap(() => super.initialize());
  }

  getMode() {
    return 'remote';
  }

  destroy0() {
    clearTimeout(this.connectivityCheckStartTimeout);
    clearTimeout(this.respawnTimeout);
    clearInterval(this.connectivityCheckInterval);

    return this._send0({ type: 'destroy-actor' }, { receive: true });
  }

  tree() {
    return this._send0({ type: 'actor-tree' }, { receive: true });
  }

  metrics() {
    return this._send0({ type: 'actor-metrics' }, { receive: true });
  }

  _ping() {
    return this._send0({ type: 'parent-ping' }, { receive: true });
  }

  changeGlobalConfigurationForChildren(config) {
    return this._send0({
      type: 'child-config-change',
      body: {
        config
      }
    }, { receive: true });
  }

  /**
   * Creates a remote actor worker endpoint and connects to it.
   *
   * @returns {P} Promise, which is resolved when actor is connected to remote endpoint
   * and is ready to handle messages.
   * @private
   */
  _createRemoteWorker() {
    return new P((resolve, reject) => {
      let host = this.additionalOptions.host;
      let port = this.additionalOptions.port || defaultListeningPort;
      let socket = new MessageSocket(net.connect(port, host));

      socket.on('error', reject);
      socket.on('connect', common.guard(reject, () => {
        this.getSystem()
          .generateActorCreationMessage(this.definition, this, _.defaults({ mode: 'remote' }, this.additionalOptions))
          .then(createMsg => {
            socket.write(createMsg, err => {
              if (err) return reject(err);

              socket.once('message', common.guard(reject, msg => {
                socket.end(); // Close connection.

                if (msg.error)
                  return reject(new Error(msg.error));

                if (msg.type != 'actor-created' || !msg.body || !msg.body.id || !msg.body.port)
                  return reject(new Error('Unexpected response for "create-actor" message.'));

                // Now connect to newly-created actor.
                this.actorSocket = new MessageSocket(net.connect(msg.body.port, host));

                this.actorSocket.on('error', reject);
                this.actorSocket.on('connect', common.guard(reject, () => {
                  this._setBus(this.actorSocket);

                  resolve();
                }));
                this.actorSocket.on('close', (hadError) => {
                  this.getLog().debug('Socket close, hadError =', hadError);

                  if (this.getState() == 'ready') {
                    // Ping remote endpoint to check if it's alive.
                    this._ping().catch(() => {
                      this._setState('crashed');
                    });
                  }
                });
              }));
            });
          })
          .catch(reject);
      }));
    });
  }

  _getReferenceMarshaller() {
    return this.getSystem().getRemoteActorReferenceMarshaller();
  }

  /**
   * Enables remote endpoint monitoring.
   *
   * @private
   */
  _monitorChild() {
    this.connectivityCheckStartTimeout = setTimeout(() => {
      this.connectivityCheckInterval = setInterval(() => {
        let lastPingTs = this._getLastReceiveTimestamp() || 0;
        let now = _.now();

        if (now - lastPingTs > this.getSystem().getPingTimeout()) {
          this._setState('crashed');

          this.getLog().warn('Attempting to respawn remote endpoint due to timeout...');

          this.actorSocket && this.actorSocket.destroy();
          clearInterval(this.connectivityCheckInterval);

          this._respawn();
        }
      }, 1000);
    }, this.getSystem().getPingTimeout());
  }

  /**
   * Restores remote endpoint connection.
   *
   * @private
   */
  _respawn() {
    this._createRemoteWorker()
      .then(() => {
        this._setState('ready');

        this.getLog().info('Successfully respawned remote endpoint.');

        this._monitorChild();
      })
      .catch(err => {
        this.getLog().warn('Failed to respawn remote endpoint (will retry in 15 seconds): ' + err.message);

        this.respawnTimeout = setTimeout(() => {
          this._respawn();
        }, 15000);
      });
  }

  toString() {
    let name = this.getName();

    if (name) {
      return 'RemoteActorParent(' + this.getId() + ', ' + name + ')';
    }
    else {
      return 'RemoteActorParent(' + this.getId() + ')';
    }
  }
}

common.mixin(RemoteActorParent, EventEmitter);

module.exports = RemoteActorParent;