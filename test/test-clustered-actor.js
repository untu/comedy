/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var actors = require('../index');
var expect = require('chai').expect;
var P = require('bluebird');
var _ = require('underscore');

var system;
var rootActor;

describe('ClusteredActor', function() {
  beforeEach(function() {
    system = actors({ test: true });

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  afterEach(function() {
    return system.destroy();
  });

  it('should properly clusterize with round robin balancing strategy', P.coroutine(function*() {
    var childBeh = {
      getPid: () => process.pid
    };

    // This should create local router and 3 sub-processes.
    var router = yield rootActor.createChild(childBeh, { mode: 'forked', clusterSize: 3 });

    var promises = _.times(6, () => router.sendAndReceive('getPid'));
    var results = yield P.all(promises);

    // Results should be separate process PIDs.
    _.each(results, result => {
      expect(result).to.be.a.number;
      expect(result).to.be.not.equal(process.pid);
    });

    // Checks results of round-robin logic.
    _.times(3, idx => {
      expect(results[idx]).to.be.equal(results[idx + 3]);
    });
  }));

  it('should correctly receive messages to parent reference from children', P.coroutine(function*() {
    /**
     * Test child behaviour class.
     */
    class ChildBehaviour {
      initialize(selfActor) {
        this.parent = selfActor.getParent();
      }

      hello() {
        return this.parent.sendAndReceive('helloReceived')
          .return('Hello!');
      }
    }

    /**
     * Test parent behaviour class.
     */
    class ParentBehaviour {
      constructor() {
        this.helloReceivedCount = 0;
      }

      helloReceived() {
        this.helloReceivedCount++;
      }

      getHelloReceivedCount() {
        return this.helloReceivedCount;
      }
    }

    var parent = yield rootActor.createChild(ParentBehaviour);
    var router = yield parent.createChild(ChildBehaviour, { clusterSize: 2 });

    yield router.sendAndReceive('hello');

    var helloReceivedCount = yield parent.sendAndReceive('getHelloReceivedCount');

    expect(helloReceivedCount).to.be.equal(1);
  }));

  it('should gather metrics from clustered child actors', P.coroutine(function*() {
    /**
     * Test child behaviour class.
     */
    class ChildBehaviour {
      metrics() {
        return { count: 1 };
      }
    }

    var router = yield rootActor.createChild(ChildBehaviour, { mode: 'forked', clusterSize: 3 });

    var metrics = yield router.metrics();

    expect(_.keys(metrics)).to.be.equal(3);
    expect(_.values(metrics)).to.be.deep.equal([{ count: 1 }, { count: 1 }, { count: 1 }]);
  }));
});