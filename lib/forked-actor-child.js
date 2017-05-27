/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var ForkedActor = require('./forked-actor.js');

/**
 * Parent proxy for ForkedActorChild.
 */
class ForkedActorChildParentProxy {
  /**
   * @param {ForkedActorChild} self Wrapped actor.
   * @param {String} parentId Actor parent ID.
   */
  constructor(self, parentId) {
    this.self = self;
    this.parentId = parentId;
  }

  /**
   * @returns {String} Actor ID.
   */
  getId() {
    return this.parentId;
  }

  /**
   * @returns {null} Actor name.
   */
  getName() {
    return null;
  }

  /**
   * Sends message to parent actor on the other side of communication channel.
   *
   * @param {*} args Arguments for send() call.
   * @returns {P} Operation promise.
   */
  send(...args) {
    return this.self.sendToParent(...args);
  }

  /**
   * Like send(), but receives response from remote actor.
   *
   * @param {*} args Arguments for sendAndReceive().
   * @returns {P} Operation promise, which yields remote actor response.
   */
  sendAndReceive(...args) {
    return this.self.sendToParentAndReceive(...args);
  }

  toString() {
    return 'ForkedActorChildParentProxy';
  }
}

/**
 * A forked actor endpoint representing a child process.
 */
class ForkedActorChild extends ForkedActor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Object} bus Message bus to send/receive messages.
   * @param {Actor} actor Wrapped actor.
   * @param {String} [parentId] Parent ID.
   */
  constructor(system, bus, actor, parentId) {
    super(system, null, bus, actor);

    this.parentId = parentId;
    this.pingTimeout = system.getPingTimeout();

    // Schedule periodic parent process ping to handle case when
    // parent process is killed with SIGKILL.
    setInterval(() => {
      this._pingParent().catch(err => {
        this.getLog().error('Parent ping failed: ' + err);

        return system.destroy();
      });
    }, Math.round(this.pingTimeout / 3));
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
    var parentId = this.getParent().getId();

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
    var parentId = this.getParent().getId();

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
    var name = this.getName();

    if (name) {
      return 'ForkedActorChild(' + this.getId() + ', ' + name + ')';
    }
    else {
      return 'ForkedActorChild(' + this.getId() + ')';
    }
  }
}

module.exports = ForkedActorChild;