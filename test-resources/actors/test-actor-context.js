/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var dep = require('./test-actor-dependency.js');

/**
 * A test actor system module context.
 */
class TestContext {
  initialize() {
    this.parameter = 'Hello' + dep.exclamation;
  }

  getParameter() {
    return this.parameter;
  }
}

module.exports = TestContext;