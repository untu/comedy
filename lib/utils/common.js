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
