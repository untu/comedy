/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/**
 * Test module-defined resource.
 */
class MessageResource {
  /**
   * Initialization hook.
   */
  initialize() {
    this.text = 'Hi there!';
  }

  /**
   * @returns {String} Message text.
   */
  getResource() {
    return this.text;
  }
}

module.exports = MessageResource;