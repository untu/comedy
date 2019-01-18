/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let ClientActorProxy = require('./client-actor-proxy.js');

/**
 * Proxy, returned for remote actor parent. Limits the functionality
 * of remote actor reference and implements remote actor respawn.
 */
class RemoteActorProxy extends ClientActorProxy {
  /**
   * @param {RemoteActorParent} actor Wrapped actor.
   * @param {Function} respawnFunction Respawning function.
   */
  constructor(actor, respawnFunction) {
    super(actor);
    this.respawnFunction = respawnFunction;
  }

  setWrapped(actor) {
    super.setWrapped(actor);

    actor.on('child-ping-timeout', () => this._respawn());
  }

  destroy() {
    clearTimeout(this.respawnTimeout);

    return super.destroy();
  }

  /**
   * Attempts to respawn remote endpoint.
   *
   * @private
   */
  _respawn() {
    if (this.respawnPromise) return; // Skip if already respawning.

    let log = this.getLog();

    log.warn('Attempting to respawn remote endpoint due to timeout...');

    this.respawnPromise = this.respawnFunction()
      .then(actor => {
        log.info('Successfully respawned remote endpoint.');

        this.setWrapped(actor);
        delete this.respawnPromise;
      })
      .catch(err => {
        log.warn('Failed to respawn remote endpoint (will retry in 15 seconds): ' + err.message);

        this.respawnTimeout = setTimeout(() => {
          delete this.respawnPromise;
          this._respawn();
        }, 15000);
      });
  }
}

module.exports = RemoteActorProxy;