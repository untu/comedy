/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let _ = require('underscore');
let P = require('bluebird');

/**
 * Waits for a given test condition.
 *
 * @param {Function} condition Condition to wait for. Condition is reached once function
 * returns true. The function can also return a promise which yields boolean result.
 * @param {Number} [deadline] Maximum number of milliseconds to wait for condition. After
 * that time, the condition is considered failed. Default is 5000.
 * @param {Number} [checkPeriod] Condition check period in milliseconds. Default is 50.
 * @returns {P} Promise that is resolved once the condition is reached and rejected if
 * deadline has passed.
 */
exports.waitForCondition = function(condition, deadline = 5000, checkPeriod = 50) {
  let startTs = _.now();

  let promiseChecker;
  let checker = function(resolve, reject, result0) {
    let result = _.isUndefined(result0) ? condition() : result0;

    if (result === true) {
      resolve();
    }
    else if (_.isFunction(result.then)) {
      promiseChecker(result, resolve, reject);
    }
    else if (_.now() - startTs > deadline) {
      reject(new Error('Condition was not reached: ' + condition));
    }
    else {
      setTimeout(_.partial(checker, resolve, reject), checkPeriod);
    }
  };
  promiseChecker = function(promise, resolve, reject) {
    promise
      .then(result => {
        checker(resolve, reject, result);
      })
      .catch(() => {
        checker(resolve, reject);
      });
  };

  return new P(checker);
};

/**
 * Generates a logger stub.
 *
 * @returns {Object} Logger stub object.
 */
exports.logStub = function() {
  return {
    debug: _.constant(),
    info: _.constant(),
    warn: _.constant(),
    error: _.constant()
  };
};

