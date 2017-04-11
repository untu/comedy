/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var common = require('../lib/utils/common.js');
var CumulativeAverage = require('./cumulative-average.js');
var P = require('bluebird');
var _ = require('underscore');
var tooBusy = require('toobusy-js');

/**
 * Abstract throughput benchmark, that sends sequential requests and measures
 * throughput with a given metric. Displays average throughput while running.
 * Subclasses should implement request logic.
 */
class AbstractThroughputBenchmark {
  /**
   * @param {String} [metricName] Throughput metric name (numberOfRequests by default).
   * @param {String} [unit] Throughput metric unit (requests by default).
   */
  constructor(metricName, unit) {
    this.metricName = metricName;
    this.unit = unit || 'requests';
  }

  /**
   * Initial setup before test run. May return promise, if setup is asynchronous.
   */
  setUp() {}

  /**
   * Final cleanup after benchmark has finished. May return promise, if cleanup is asynchronous.
   */
  tearDown() {}

  /**
   * Actual request implementation.
   *
   * @returns {P} Request promise, that yields a value of a throughput metric
   * for this request.
   */
  request() {
    return common.abstractMethodError('request');
  }

  /**
   * Internal run method.
   *
   * @param {Object} [options] Benchmark options.
   * @returns {P} Run promise, that is fulfilled when test run has finished.
   * The promise yields the benchmark result object.
   * @private
   */
  _run(options) {
    options = options || {};

    var runTime = options.runTime || common.millisecondTime(1, 'minutes');
    var logInterval = 1000; // Display interval in milliseconds.
    var concurrencyLevel = options.concurrencyLevel || 64;
    var startTime = _.now();
    var curMetricValue = 0;
    var curResult = {
      numberOfRequests: 0,
      totalTime: 0,
      error: false
    };
    var avgMemStats = {
      rss: new CumulativeAverage({ precision: 0 }),
      heapTotal: new CumulativeAverage({ precision: 0 }),
      heapUsed: new CumulativeAverage({ precision: 0 })
    };
    var stop = false;

    // Launch result recording.
    var resultRecHandle = setInterval(() => {
      curResult.totalTime = Date.now() - startTime;

      var metricValue = curResult.numberOfRequests;

      if (this.metricName) {
        metricValue = curMetricValue;
      }

      console.log('Average throughput: ' +
        Math.round(metricValue / (curResult.totalTime / 1000)) + ' ' + this.unit + ' per second');

      if (tooBusy.lag() > 3000) {
        console.log('WARNING: event loop lag is ' + tooBusy.lag() + 'ms');
      }

      var curMemUsage = process.memoryUsage();
      avgMemStats.rss.add(curMemUsage.rss);
      avgMemStats.heapTotal.add(curMemUsage.heapTotal);
      avgMemStats.heapUsed.add(curMemUsage.heapUsed);
    }, logInterval);

    var result = () => {
      var avgMemUsage = common.transformObject(
        avgMemStats,
        value => common.humanReadableNumber(value.getAndReset(), { bytes: true }));

      var result0 = curResult;

      if (this.metricName) {
        result0 = _.defaults(curResult, common.pair(this.metricName, curMetricValue));
      }

      return _.extend({}, result0, { averageMemoryUsage: avgMemUsage });
    };

    var requestLoop = () => {
      return new P(resolve => {
        var requestLoop0 = () => {
          this.request()
            .then(reqResult => {
              if (_.isUndefined(reqResult)) {
                reqResult = 1;
              }

              curMetricValue += reqResult;

              curResult.numberOfRequests++;

              if (stop) {
                resolve();
              }
              else {
                requestLoop0();
              }
            })
            .catch(err => {
              console.log('Request error:', err);

              curResult.error = err;

              if (stop) {
                resolve();
              }
              else {
                requestLoop0();
              }
            });
        };

        requestLoop0();
      });
    };

    var runBenchmark = () => {
      return _.times(concurrencyLevel, () => requestLoop());
    };

    return P.resolve()
      .then(() => runBenchmark())
      .then(loopPromises => {
        return P.delay(runTime)
          .then(() => {
            curResult.totalTime = _.now() - startTime;

            return result();
          })
          .finally(() => {
            stop = true;
            clearInterval(resultRecHandle);

            return P.all(loopPromises);
          });
      });
  }

  /**
   * Runs this benchmark.
   *
   * @param {Object} [options] Benchmark options.
   * - {Number} runTime Benchmark run time in milliseconds. Default is 1 minute.
   * - {Number} concurrencyLevel How many requests to send in parallel. Default is 64.
   * @returns {P} Run promise, that is fulfilled when test run has finished.
   * The promise yields the benchmark result object.
   */
  run(options) {
    options = options || {};

    var testTime = options.testTime || common.millisecondTime(1, 'minutes');

    return P.resolve()
      .then(() => this.setUp())
      .then(() => {
        console.log(`Running test for ${testTime / 1000} seconds...`);

        return this._run(_.defaults({ runTime: testTime }, options)); // Run main test.
      })
      .finally(() => this.tearDown());
  }

  /**
   * Runs this benchmark with warm-up.
   *
   * @param {Object} [options] Benchmark options, described in run() method, plus:
   * - {Number} warmUpTime Warm-up time in milliseconds.
   * @returns {P} Run promise, that is fulfilled when both warm-up and
   * main run have finished. The promise yields the benchmark result object.
   */
  runWithWarmUp(options) {
    options = options || {};

    var warmUpTime = options.warmUpTime || common.millisecondTime(30, 'seconds');
    var testTime = options.testTime || common.millisecondTime(1, 'minutes');

    console.log(`Warming-up for ${warmUpTime / 1000} seconds...`);

    return P.resolve()
      .then(() => this.setUp())
      .then(() => {
        return this._run(_.defaults({ runTime: warmUpTime }, options)) // Run warm-up.
          .then(() => {
            console.log(`Running test for ${testTime / 1000} seconds...`);

            return this._run(_.defaults({ runTime: testTime }, options)); // Run main test.
          });
      })
      .finally(() => this.tearDown());
  }
}

module.exports = AbstractThroughputBenchmark;