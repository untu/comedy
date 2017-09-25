/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/* eslint require-jsdoc: "off" */

var expect = require('chai').expect;
var actors = require('../index');
var P = require('bluebird');

var testSystem;

describe('ActorSystem', function() {
  afterEach(function() {
    if (testSystem) {
      return testSystem.destroy();
    }
  });

  it('should destroy all actors and call proper hooks upon destruction', P.coroutine(function*() {
    var hookList = [];

    class MyResource {
      getResource() {
        return 'MyResource value';
      }

      destroy() {
        hookList.push('resource');
      }
    }

    class RootActor {
      static inject() {
        return ['MyResource'];
      }

      destroy() {
        hookList.push('root');
      }
    }

    testSystem = actors({
      resources: [MyResource],
      root: RootActor,
      test: true
    });

    var rootActor = yield testSystem.rootActor();
    var childActor = yield rootActor.createChild({
      destroy: () => hookList.push('child')
    });
    yield childActor.createChild({
      destroy: () => hookList.push('grandchild')
    });

    yield testSystem.destroy();

    expect(hookList).to.be.deep.equal(['grandchild', 'child', 'root', 'resource']);
  }));
});