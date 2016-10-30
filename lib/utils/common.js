/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

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

  var prototype = input.constructor.prototype;

  if (typeof prototype !== 'object') return false;

  if (Object.prototype.toString.call(prototype) !== '[object Object]') return false;

  return prototype.hasOwnProperty('isPrototypeOf');
};

/**
 * Throws abstract method error.
 *
 * @param {String} methodName Method name.
 */
exports.abstractMethodError = function(methodName) {
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

  var keyFunc = options && options.keyFunction;
  var filter = options && options.filter;
  var depth = options && options.depth;
  var parseJson = options && options.parseJson;

  if (depth <= 0) return obj;

  var recurs = function(obj, out, path, depth) {
    if (!out) {
      out = {};
    }

    Object.keys(obj).forEach(function(key) {
      var value = obj[key];
      var key0 = keyFunc && keyFunc(key, obj) || key;
      var path0 = path ? path + '.' + key0 : '' + key0;

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
