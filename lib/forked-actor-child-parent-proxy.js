/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

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

module.exports = ForkedActorChildParentProxy;