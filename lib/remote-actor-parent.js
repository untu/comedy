/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var ForkedActorParent = require('./forked-actor-parent.js');
var EventEmitter = require('events').EventEmitter;
var common = require('./utils/common.js');
var _ = require('underscore');

/**
 * Represents a parent (originator) process endpoint of a remote actor.
 */
class RemoteActorParent extends ForkedActorParent {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Actor} parent Parent actor.
   * @param {MessageSocket} bus Message bus to send/receive messages.
   * @param {String} id Actor ID.
   * @param {String} name Actor name.
   */
  constructor(system, parent, bus, id, name) {
    super(system, parent, bus, id, name);
    EventEmitter.call(this);

    this.connectivityCheckStartTimeout = setTimeout(() => {
      this.connectivityCheckInterval = setInterval(() => {
        var lastPingTs = this._getLastReceiveTimestamp() || 0;
        var now = _.now();

        if (now - lastPingTs > system.getPingTimeout()) {
          bus.destroy();
          clearInterval(this.connectivityCheckInterval);

          this.emit('child-ping-timeout');
        }
      }, 1000);
    }, system.getPingTimeout());
  }

  destroy0() {
    clearTimeout(this.connectivityCheckStartTimeout);
    clearInterval(this.connectivityCheckInterval);

    return super.destroy0();
  }

  toString() {
    var name = this.getName();

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