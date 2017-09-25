/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var expect = require('chai').expect;
var common = require('../lib/utils/common.js');
var bson = require('bson');

describe('common', function() {
  describe('isPlainObject()', function() {
    it('should return true for plain JS objects', function() {
      expect(common.isPlainObject({})).to.be.equal(true);
      expect(common.isPlainObject({ a: 1 })).to.be.equal(true);
      expect(common.isPlainObject({ a: 1, b: [1, 2, 3] })).to.be.equal(true);
    });

    it('should return false for non-plain JS objects', function() {
      expect(common.isPlainObject([])).to.be.equal(false);
      expect(common.isPlainObject(() => false)).to.be.equal(false);
      expect(common.isPlainObject(new bson.ObjectID())).to.be.equal(false);
    });
  });

  describe('flatten()', function() {
    it('should leave single-level object unmodified', function() {
      expect(common.flatten({ abc: 1, def: 2 })).to.be.deep.equal({ abc: 1, def: 2 });
    });

    it('should flatten multi-level objects', function() {
      expect(common.flatten({
        abc: 1,
        nested: {
          value1: 'aaa',
          value2: 'bbb',
          subNested: {
            subValue: 'xxx'
          }
        }
      })).to.be.deep.equal({
        abc: 1,
        'nested.value1': 'aaa',
        'nested.value2': 'bbb',
        'nested.subNested.subValue': 'xxx'
      });
    });

    it('should support arrays', function() {
      expect(common.flatten({
        abc: 1,
        array: [
          { value: 'a' },
          { value: 'b' }
        ]
      })).to.be.deep.equal({
        abc: 1,
        'array.0.value': 'a',
        'array.1.value': 'b'
      });
    });

    it('should support depth parameter', function() {
      expect(common.flatten({
        abc: 1,
        nested: {
          value1: 'aaa',
          value2: 'bbb',
          subNested: {
            subValue: 'xxx'
          }
        }
      }, { depth: 2 })).to.be.deep.equal({
        abc: 1,
        'nested.value1': 'aaa',
        'nested.value2': 'bbb',
        'nested.subNested': {
          subValue: 'xxx'
        }
      });
    });

    it('should gracefully handle corner cases', function() {
      expect(common.flatten(undefined)).to.be.equal(undefined);
    });

    it('should be able to parse nested JSON', function() {
      expect(common.flatten({ jsonField: '{ "a": 1 }' }, { parseJson: true })).to.be.deep.equal({
        'jsonField.a': 1
      });

      var input = [{
        'id': 2,
        'default_type_condition': '[{"condition": {"freeMemory": "30000"}, "state": 3}]'
      }];
      var result = common.flatten(input, {
        parseJson: true,
        keyFunction: function(key) {
          expect(key).to.be.a('string');

          return key;
        }
      });
      expect(result).to.be.deep.equal({
        '0.id': 2,
        '0.default_type_condition.0.condition.freeMemory': 30000,
        '0.default_type_condition.0.state': 3
      });
    });
  });
});