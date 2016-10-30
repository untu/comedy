/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/**
 * Test child actor.
 */
class ChildActor1 {
  hello() {
    return 'Hello from ChildActor1';
  }
}

module.exports = ChildActor1;