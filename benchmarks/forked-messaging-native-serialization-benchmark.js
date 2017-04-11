/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var AbstractThroughputBenchmark = require('./abstract-throughput-benchmark.js');
var actors = require('../index.js');

/**
 * A test actor for measuring messaging throughput in forked mode.
 */
class TestActor {
  initialize(selfActor) {
    return selfActor
      .createChild({ test: msg => msg }, { mode: 'forked' }) // Create a child 'echo' forked actor.
      .then(child => {
        this.child = child;
      });
  }

  /**
   * Test message handler.
   *
   * @param {Object} msg Test message.
   * @returns {Promise} Message roundtrip promise.
   */
  test(msg) {
    return this.child.sendAndReceive('test', msg);
  }
}

/**
 * Measures messaging throughput in forked mode using native serialization.
 */
class ForkedMessagingNativeSerializationBenchmark extends AbstractThroughputBenchmark {
  setUp() {
    this.system = actors();

    return this.system.rootActor()
      .then(rootActor => rootActor.createChild(TestActor))
      .then(testActor => {
        this.actor = testActor;
      });
  }

  tearDown() {
    return this.system.destroy();
  }

  request() {
    return this.actor.sendAndReceive('test', {
      command: 'test-command',
      parameters: {
        parameter1: 'value1',
        parameter2: 'value2',
        parameter3: ['abc', 'def', 'ghi'],
        parameter4: 42
      }
    });
  }
}

var bm = new ForkedMessagingNativeSerializationBenchmark();

bm.runWithWarmUp({ concurrencyLevel: 16 }).then(result => {
  console.log({
    'Total roundtrips': result.numberOfRequests,
    'Total test time (seconds)': Math.round(result.totalTime / 1000),
    'Average throughput (roundtrips per second)': Math.round(result.numberOfRequests / (result.totalTime / 1000)),
    'Average response time (milliseconds)': Math.round(result.totalTime / result.numberOfRequests),
    'Errors': result.error && result.error.message || 'no',
    'Average memory usage': result.averageMemoryUsage
  });
});
