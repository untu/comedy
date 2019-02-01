/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/**
 * Time unit multipliers for getting millisecond time.
 */
const timeUnitMultipliers = {
  /**
   * Milliseconds multiplier.
   *
   * @returns {Number} Multiplier for milliseconds.
   */
  milliseconds: function() {
    return 1;
  },

  /**
   * Seconds multiplier.
   *
   * @returns {Number} Multiplier for milliseconds.
   */
  seconds: function() {
    return 1000;
  },

  /**
   * Minutes multiplier.
   *
   * @returns {Number} Multiplier for milliseconds.
   */
  minutes: function() {
    return this.seconds() * 60;
  },

  /**
   * Hours multiplier.
   *
   * @returns {Number} Multiplier for milliseconds.
   */
  hours: function() {
    return this.minutes() * 60;
  },

  /**
   * Days multiplier.
   *
   * @returns {Number} Multiplier for milliseconds.
   */
  days: function() {
    return this.hours() * 24;
  },

  /**
   * Weeks multiplier.
   *
   * @returns {Number} Multiplier for milliseconds.
   */
  weeks: function() {
    return this.days() * 7;
  },

  /**
   * Months multiplier.
   *
   * @returns {Number} Multiplier for milliseconds.
   */
  months: function() {
    return this.days() * 31;
  },

  /**
   * Years multiplier.
   *
   * @returns {Number} Multiplier for milliseconds.
   */
  years: function() {
    return this.days() * 365;
  }
};

/**
 * Converts a number to human-readable form, with order-of-magnitude
 * postfix.
 *
 * Examples: 1000 => 1.0 K; 1500 => 1.5 K; 1000000 => 1.0 M; 1500000 => 1.5 M.
 *
 * @param {Number|String} n Number to convert.
 * @param {Object} [options] Function options.
 * - {Boolean} bytes Bytes mode flag. In bytes mode, 1 K = 1024 instead of 1000. False by default.
 * - {Number} precision Floating point precision for the resulting number, i.e. how many digits after decimal point.
 * - {String} separator Separator label. Default ' '.
 * - {Boolean} pair Return result as array of number and unit.
 * numbers will be present in the resulting floating point number. 3 by default.
 * @returns {String|Array} Human-readable string representation of a number, or input, if it is not supported.
 */
exports.humanReadableNumber = function(n, options) {
  let n0 = n;
  options = options || {};
  options.separator = typeof options.separator === 'string' ? options.separator : ' ';

  if (typeof n0 == 'string') {
    if (!n0.match(/^[\d]+.?[\d]*$/)) {
      return n0;
    }

    n0 = parseFloat(n);
  }

  let units = 'KMGTPEZYXWVU';
  let thresh = options.bytes ? 1024 : 1000;

  // Not Number or NaN.
  // Skip non-positive numbers.
  if (typeof n0 != 'number' || n0 != +n0 || n0 <= 0 || n0 < thresh) {
    return options.pair ? [n, ''] : n;
  }

  let u = -1;

  do {
    n0 /= thresh;

    u += 1;
  }
  while (n0 >= thresh);

  let resultNumber = parseFloat(n0.toPrecision(options.precision || 3));

  return options.pair ? [resultNumber, units.charAt(u)] : resultNumber + options.separator + units.charAt(u);
};

/**
 * Converts an input time value from a specified time unit to milliseconds.
 *
 * @param {Number|String} timeValue Input time value.
 * @param {String} timeUnit Time unit string ('minutes', 'hours', 'weeks', 'days', etc.).
 * @returns {Number} Time value in milliseconds.
 */
exports.millisecondTime = function(timeValue, timeUnit) {
  timeValue = parseInt(timeValue, 10);

  let multi = timeUnitMultipliers[timeUnit];

  if (!multi) throw new Error('Unknown time unit: ' + timeUnit);

  return timeValue * multi.call(timeUnitMultipliers);
};