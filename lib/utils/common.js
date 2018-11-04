/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let _ = require('underscore');

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
 * Checks if a given input is a plain JS object.
 *
 * @param {*} input Input to test.
 * @returns {Boolean} True if an input is plain JS object, false otherwise.
 */
exports.isPlainObject = function(input) {
  if (typeof input !== 'object') return false;

  if (Object.prototype.toString.call(input) !== '[object Object]') return false;

  if (typeof input.constructor !== 'function') return false;

  let prototype = input.constructor.prototype;

  if (typeof prototype !== 'object') return false;

  if (Object.prototype.toString.call(prototype) !== '[object Object]') return false;

  return prototype.hasOwnProperty('isPrototypeOf');
};

/**
 * Throws abstract method error.
 *
 * @param {String} methodName Method name.
 * @param {*} args Method args.
 */
exports.abstractMethodError = function(methodName, ...args) {
  throw new Error('Method "' + methodName + '" is abstract and should be implemented in subclasses.');
};

/**
 * Flattens an object, converting any nested objects
 * into fields.
 *
 * @param {Object|undefined} obj Object to flatten.
 * @param {Object} [options] Flattening options.
 * - {Number} [depth] Recursion depth.
 * - {Function} [keyFunction] Function for key generation.
 * - {Function} [filter] Function for key filtering.
 * - {Boolean} [parseJson] Whether to parse nested JSON.
 * @returns {Object|undefined} Flattened object or undefined if input was undefined.
 */
exports.flatten = function(obj, options) {
  if (!obj) return;

  let keyFunc = options && options.keyFunction;
  let filter = options && options.filter;
  let depth = options && options.depth;
  let parseJson = options && options.parseJson;

  if (depth <= 0) return obj;

  let recurs = function(obj, out, path, depth) {
    if (!out) {
      out = {};
    }

    Object.keys(obj).forEach(function(key) {
      let value = obj[key];
      let key0 = keyFunc && keyFunc(key, obj) || key;
      let path0 = path ? path + '.' + key0 : '' + key0;

      if (value === undefined || value === null) return;

      if (parseJson && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        }
        catch (e) {}
      }

      if (value === null || typeof value !== 'object' || depth <= 0) {
        if (!filter || filter(key, obj)) {
          out[path0] = value;
        }
      }
      else if (depth > 0) {
        recurs(value, out, path0, depth - 1);
      }
      else {
        recurs(value, out, path0);
      }
    });

    return out;
  };

  return recurs(obj, undefined, undefined, depth > 0 ? depth - 1 : undefined);
};

/**
 * Transforms an object into another object. Runs a transformation function over the
 * input object key-value pairs and either modifies a value of a key-value pair, removes
 * the key-value pair, or substitutes it with the provided one.
 *
 * @param {Object} obj Input object.
 * @param {Function} iter Iterator (transformation) function. Iterates through object key-value pairs.
 * Receives a value as a first argument and a key as a second argument. Possible return values:
 * - true: Leave key-value pair unchanged (will be copied verbatim to resulting object).
 * - Array[2]: Use new key-value pair for original one.
 * - false|undefined: Skip this key-value pair (won't be present in resulting object).
 * - any other value: Use original key with a new value.
 * @param {Object} [context] Iterator function context (this object).
 * @returns {Object} Resulting object.
 */
exports.transformObject = function(obj, iter, context) {
  let ret = {};

  Object.keys(obj).forEach(function(key, idx) {
    let res = iter.call(this, obj[key], key, idx);

    if (res === true) { // Leave key-value pair unchanged.
      ret[key] = obj[key];
    }
    else if (res instanceof Array && res.length == 2) { // Convert to another key-value pair.
      ret[res[0]] = res[1];
    }
    else if (res !== false && res !== undefined) { // Use new value with original key.
      ret[key] = res;
    }
  }, context || this);

  return ret;
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
 * Generates a key-value pair object.
 *
 * @param {*} key Key.
 * @param {*} value Value.
 * @returns {Object} Key-value pair object.
 */
exports.pair = function(key, value) {
  let o = {};
  o[key] = value;

  return o;
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

/**
 * Wraps a given operation into a try-catch block, invoking callback with error
 * if it was thrown.
 *
 * @param {Function} errCb Error callback. Gets error as input parameter.
 * @param {Function} guardedOp Operation to guard.
 * @returns {Function} Guarded function.
 */
exports.guard = function(errCb, guardedOp) {
  return function(...args) {
    try {
      guardedOp(...args);
    }
    catch (err) {
      errCb(err);
    }
  };
};

/**
 * Mixes one class into another. That is, copies properties from a
 * prototype of a mixin class to a prototype of a given class.
 *
 * @param {Function} cls Class to extend. Prototype of this class is modified in-place.
 * @param {Function} mixinCls Mixin class.
 * @returns {*} Extended class. This is equal to the first parameter.
 */
exports.mixin = function(cls, mixinCls) {
  return _.extendOwn(cls.prototype, mixinCls.prototype);
};

/**
 * Checks if current platform is Windows.
 *
 * @returns {Boolean} True if platform is Windows, false otherwise.
 */
exports.isWindows = function() {
  return /^win/.test(process.platform);
};

/**
 * Deeply extends target object with source object.
 *
 * @param {Object} target Target object to extend.
 * @param {Object} source Object with new properties.
 * @returns {*|{}} Extended target object.
 */
exports.deepExtend = function deepExtend(target, source) {
  target = target || {};
  source = source || {};
  let keys = Object.keys(source);

  for (let prop = 0; prop < keys.length; prop++) {
    let value = source[keys[prop]];

    if (_.isObject(value) && !_.isArray(value)) {
      target[keys[prop]] = deepExtend(target[keys[prop]], value);
    }
    else {
      target[keys[prop]] = value;
    }
  }

  return target;
};

/**
 * Attempts to require a given module.
 *
 * @param {String} modulePath Module path.
 * @param {String} [exportName] Name of a particular module export to return.
 * If undefined or empty - the whole module is returned.
 * @returns {*} Loaded resource on success, undefined on failure.
 */
exports.tryRequire = function(modulePath, exportName) {
  try {
    let module = require(modulePath);

    if (exportName) {
      return module[exportName];
    }
    else {
      return module;
    }
  }
  catch (err) {}
};

/**
 * @returns {Object} Parsed current NodeJS version.
 */
exports.getNodeJsVersions = function() {
  let split = process.versions.node.split('.');

  return {
    major: parseInt(split[0]),
    minor: parseInt(split[1]),
    revision: parseInt(split[2])
  };
};

/**
 * Throws appropriate error for the case when threaded actors are not supported
 * by current NodeJS version/configuration.
 */
exports.throwThreadedActorsUnavailableError = function() {
  if (exports.getNodeJsVersions().major < 10) {
    throw new Error('Threaded actors are not supported in current NodeJS version.');
  }

  throw new Error('Please run NodeJS with --experimental-worker flag to enable threaded actors.');
};