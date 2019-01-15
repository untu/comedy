/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/**
 * Actor proxy that is returned to the client. Limits actor functionality
 * available to client and keeps actor reference valid after actor configuration change.
 */
class ClientActorProxy {
  /**
   * @param {Actor} actor Wrapped actor.
   */
  constructor(actor) {
    this.setWrapped(actor);
  }

  /**
   * Initializes the actor.
   */
  initialize() {
    this.actor.initialize();
  }

  /**
   * Sets a new wrapped actor for this stub.
   *
   * @param {Actor} actor Wrapped actor.
   */
  setWrapped(actor) {
    this.actor = actor;

    actor.on('augmented', newActor => {
      this.setWrapped(newActor);
    });
  }

  /**
   * @returns {Actor} Wrapped actor for this stub.
   */
  getWrapped() {
    return this.actor;
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
   * Synchronously returns this actor's logger.
   *
   * @returns {Logger|ActorLogger} Actor logger.
   */
  getLog() {
    return this.actor.getLog();
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
   * Synchronously returns custom actor parameters, if any.
   *
   * @returns {Object|undefined} Custom actor parameters or undefined, if custom parameters
   * were not set.
   */
  getCustomParameters() {
    return this.actor.getCustomParameters();
  }

  /**
   * Sends a message to actor. See Actor.send().
   *
   * @param {*} args Stubbed arguments.
   * @returns {Promise} Operation promise.
   */
  send(...args) {
    return this.actor.send(...args);
  }

  /**
   * Sends a message to actor and waits for response. See Actor.sendAndReceive().
   *
   * @param {*} args Stubbed arguments.
   * @returns {Promise} Operation promise, that yields actor response.
   */
  sendAndReceive(...args) {
    return this.actor.sendAndReceive(...args);
  }

  /**
   * Performs a hot configuration change for this actor. Actor remains operational
   * during and after configuration change.
   *
   * @param {*} args Stubbed arguments.
   * @returns {Promise} Operation promise.
   */
  changeConfiguration(...args) {
    return this.actor.changeConfiguration(...args);
  }

  /**
   * Outputs actor tree for this actor.
   *
   * @returns {Promise} Operation promise that yields actor tree data object.
   */
  tree() {
    return this.actor.tree();
  }

  /**
   * Returns metrics for this actor.
   *
   * @returns {Promise} Operation promise that yields actor metrics.
   */
  metrics() {
    return this.actor.metrics();
  }

  /**
   * Destroys this actor.
   *
   * @returns {Promise} Operation promise.
   */
  destroy() {
    return this.actor.destroy();
  }

  /**
   * Subscribes to actor events.
   */
  once() {
    this.actor.on.apply(this.actor, arguments);
  }

  toString() {
    return this.actor.toString();
  }
}

module.exports = ClientActorProxy;