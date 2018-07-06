/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let AbstractThroughputBenchmark = require('./abstract-throughput-benchmark.js');
let actors = require('../index.js');
let P = require('bluebird');

/**
 * A test actor for measuring messaging throughput in remote mode.
 */
class TestActor {
  initialize(selfActor) {
    return selfActor
      .createChild({ test: msg => msg }, { mode: 'remote', host: '127.0.0.1' }) // Create a child 'echo' remote actor.
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
 * Measures messaging throughput in remote mode using native serialization.
 */
class ForkedMessagingNativeSerializationBenchmark extends AbstractThroughputBenchmark {
  setUp() {
    this.system = actors();
    this.listenerSystem = actors();

    return this.listenerSystem.listen()
      .then(() => this.system.rootActor())
      .then(rootActor => rootActor.createChild(TestActor))
      .then(testActor => {
        this.actor = testActor;
      });
  }

  tearDown() {
    return P.join(this.system.destroy(), this.listenerSystem.destroy());
  }

  iteration() {
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

let bm = new ForkedMessagingNativeSerializationBenchmark();

bm.runWithWarmUp({ concurrencyLevel: 16 }).then(result => {
  console.log({
    'Total roundtrips': result.numberOfIterations,
    'Total test time (seconds)': Math.round(result.totalTime / 1000),
    'Average throughput (roundtrips per second)': Math.round(result.numberOfIterations / (result.totalTime / 1000)),
    'Average response time (milliseconds)': Math.round(result.totalTime / result.numberOfIterations),
    'Errors': result.error && result.error.message || 'no',
    'Average memory usage': result.averageMemoryUsage
  });
});
