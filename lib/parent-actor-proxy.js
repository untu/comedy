/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/**
 * Proxy, returned from actor.getParent(). Limits the functionality
 * of parent actor reference.
 */
class ParentActorProxy {
  /**
   * @param {Actor} actor Wrapped actor.
   */
  constructor(actor) {
    this.actor = actor;
  }

  /**
   * Synchronously returns this actor's ID.
   *
   * @returns {String} This actor ID.
   */
  getId() {
    return this.actor.getId();
  }

  /**
   * Synchronously returns this actor's name.
   *
   * @returns {String} This actor's name or empty string, if there is no name for this actor.
   */
  getName() {
    return this.actor.getName();
  }

  /**
   * Synchronously returns this actor's mode.
   *
   * @returns {String} Actor mode.
   */
  getMode() {
    return this.actor.getMode();
  }

  /**
   * Sends a message to actor. See Actor.send().
   *
   * @param {*} args Stubbed arguments.
   * @returns {P} Operation promise.
   */
  send(...args) {
    return this.actor.send(...args);
  }

  /**
   * Sends a message to actor and waits for response. See Actor.sendAndReceive().
   *
   * @param {*} args Stubbed arguments.
   * @returns {P} Operation promise, that yields actor response.
   */
  sendAndReceive(...args) {
    return this.actor.sendAndReceive(...args);
  }

  toString() {
    return this.actor.toString();
  }
}

module.exports = ParentActorProxy;