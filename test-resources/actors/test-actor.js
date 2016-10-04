'use strict';

var dep = require('./test-actor-dependency.js');

/**
 * A test actor.
 */
class TestActor {
  hello(text) {
    return `Hello ${text}${dep.exclamation}`;
  }
}

module.exports = TestActor;