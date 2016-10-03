'use strict';

/**
 * Stub, returned for forked actor parent. Limits the functionality
 * of forked actor reference.
 */
class ForkedActorStub {
  /**
   * @param {Actor} actor Wrapped actor.
   */
  constructor(actor) {
    this.actor = actor;
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

  /**
   * Outputs actor tree for this actor.
   *
   * @returns {P} Operation promise that yields actor tree data object.
   */
  tree() {
    return this.actor.tree();
  }

  /**
   * Destroys this actor.
   *
   * @returns {P} Operation promise.
   */
  destroy() {
    return this.actor.destroy();
  }

  toString() {
    return this.actor.toString();
  }
}

module.exports = ForkedActorStub;