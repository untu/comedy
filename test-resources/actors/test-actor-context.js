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