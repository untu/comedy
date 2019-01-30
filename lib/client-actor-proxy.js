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
   *
   * @returns {Promise} Actor initialization promise.
   */
  initialize() {
    return this.actor.initialize();
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
   * Synchronously returns this actor's state.
   *
   * @returns {String} Actor state.
   */
  getState() {
    return this.actor.getState();
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
   * Broadcasts a given message to all instances of a clustered actor.
   * For ordinary (non-clustered) actor it's just the same as send().
   *
   * @param {*} args Stubbed arguments.
   * @returns {Promise} Operation promise.
   */
  broadcast(...args) {
    return this.actor.broadcast(...args);
  }

  /**
   * Broadcasts a given message to all instances of a clustered actor, and collects results.
   * For ordinary (non-clustered) actor it's just the same as sendAndReceive().
   *
   * @param {*} args Stubbed arguments.
   * @returns {Promise} Operation promise which yields actor response.
   */
  broadcastAndReceive(...args) {
    return this.actor.broadcastAndReceive(...args);
  }

  /**
   * Performs a hot configuration change for this actor. Actor remains operational
   * during and after configuration change.
   *
   * @param {*} args Stubbed arguments.
   */
  async changeConfiguration(...args) {
    await this.actor.changeConfiguration(...args);
  }

  /**
   * Recursively applies new global configuration to this actor an all it's
   * child sub-tree.
   *
   * @param {Object} config Global actor configuration.
   * @returns {Promise} Configuration change promise. When promise is
   * resolved, this actor sub-tree is fully operational.
   */
  changeGlobalConfiguration(config) {
    return this.actor.changeGlobalConfiguration(config);
  }

  /**
   * Changes global configuration for child actors.
   *
   * @param {Object} config New configuration.
   * @returns {Promise<void>} Operation promise.
   */
  changeGlobalConfigurationForChildren(config) {
    return this.actor.changeGlobalConfigurationForChildren(config);
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