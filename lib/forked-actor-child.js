/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let ForkedActor = require('./forked-actor.js');
let ForkedActorChildParentProxy = require('./forked-actor-child-parent-proxy.js');

/**
 * A forked actor endpoint representing a child process.
 */
class ForkedActorChild extends ForkedActor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Object} bus Message bus to send/receive messages.
   * - {Actor} actor Wrapped actor.
   * - {Object} definition Actor behaviour definition.
   * - {String} [parentId] Parent ID.
   */
  constructor(options) {
    super({
      system: options.system,
      parent: null,
      definition: options.definition,
      bus: options.bus,
      actor: options.actor
    });

    this.parentId = options.parentId;
    this.pingTimeout = options.system.getPingTimeout();
  }

  initialize() {
    return super.initialize()
      .tap(() => {
        // Schedule periodic parent process ping to handle case when
        // parent process is killed with SIGKILL.
        setInterval(() => {
          this._pingParent().catch(err => {
            this.getLog().error('Parent ping failed: ' + err);

            return this.getSystem().destroy();
          });
        }, Math.round(this.pingTimeout / 3));
      });
  }

  getParent() {
    return new ForkedActorChildParentProxy(this, this.parentId);
  }

  send0() {
    return this._getActor().send.apply(this._getActor(), arguments);
  }

  sendAndReceive0() {
    return this._getActor().sendAndReceive.apply(this._getActor(), arguments);
  }

  /**
   * Sends a message to a parent actor on the other side of the communication channel.
   *
   * @param {String} topic Message topic.
   * @param {*} message Message body.
   * @returns {P} Operation promise.
   */
  sendToParent(topic, ...message) {
    let parentId = this.getParent().getId();

    return this._sendActorMessage(topic, message, { receive: false, actorId: parentId });
  }

  /**
   * Sends a message to a parent actor on the other side of the communication channel and waits
   * for response.
   *
   * @param {String} topic Message topic.
   * @param {*} message Message body.
   * @returns {P} Operation promise, which yields a remote actor response.
   */
  sendToParentAndReceive(topic, ...message) {
    let parentId = this.getParent().getId();

    return this._sendActorMessage(topic, message, { receive: true, actorId: parentId });
  }

  location0() {
    return this._getActor().location0();
  }

  /**
   * Sends a ping message to it's forked parent counterpart.
   *
   * @returns {P} Send promise.
   * @private
   */
  _pingParent() {
    this.getLog().debug('Pinging parent...');

    return this._send0({ type: 'parent-ping' }, { receive: true, timeout: this.pingTimeout });
  }

  toString() {
    let name = this.getName();

    if (name) {
      return 'ForkedActorChild(' + this.getId() + ', ' + name + ')';
    }
    else {
      return 'ForkedActorChild(' + this.getId() + ')';
    }
  }
}

module.exports = ForkedActorChild;