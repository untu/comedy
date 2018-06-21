/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var actors = require('../index');
var tu = require('../lib/utils/test.js');
var expect = require('chai').expect;
var isRunning = require('is-running');
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
    var router = yield parent.createChild(ChildBehaviour, { mode: 'forked', clusterSize: 2 });

    yield router.sendAndReceive('hello');

    var helloReceivedCount = yield parent.sendAndReceive('getHelloReceivedCount');

    expect(helloReceivedCount).to.be.equal(1);
  }));

  it('should support random balancer', P.coroutine(function*() {
    /**
     * Child definition.
     */
    class Child {
      initialize(selfActor) {
        this.id = selfActor.getId();
      }

      test() {
        return this.id;
      }
    }

    /**
     * Parent definition.
     */
    class Parent {
      async initialize(selfActor) {
        this.router = await selfActor.createChild(Child, {
          mode: 'forked',
          clusterSize: 2,
          balancer: 'random'
        });
      }

      async test() {
        var counters = {};
        var maxDelta = 0;

        for (var i = 0; i < 100; i++) {
          var from = await this.router.sendAndReceive('test');
          counters[from] && counters[from]++ || (counters[from] = 1);

          var curDelta = _.reduce(counters, (memo, value) => Math.abs(value - memo), 0);

          maxDelta = Math.max(maxDelta, curDelta);
        }

        expect(maxDelta).to.be.within(2, 99);
      }
    }

    var parent = yield rootActor.createChild(Parent);

    yield parent.sendAndReceive('test');
  }));

  it('should support custom balancers', P.coroutine(function*() {
    /**
     * Child actor.
     */
    class Child {
      constructor() {
        this.received = [];
      }

      test(msg) {
        this.received.push(msg);
      }

      getReceived() {
        return this.received;
      }
    }

    /**
     * Custom balancer.
     */
    class CustomBalancer {
      clusterChanged(actors) {
        var _ = require('underscore');

        this.table = _.chain(actors).map(actor => actor.getId()).sortBy().value();
      }

      forward(topic, msg) {
        var tableIdx = msg.shard % this.table.length;

        return this.table[tableIdx];
      }
    }

    // Define custom system with our test balancer.
    yield system.destroy();
    system = actors({
      test: true,
      balancers: [CustomBalancer]
    });
    rootActor = yield system.rootActor();

    // Create clustered actor with custom balancer.
    var parent = yield rootActor.createChild(Child, {
      mode: 'forked',
      clusterSize: 3,
      balancer: 'CustomBalancer'
    });

    yield parent.sendAndReceive('test', { shard: 0, value: 1 });
    yield P.mapSeries(_.range(2), idx => parent.sendAndReceive('test', { shard: 1, value: idx }));
    yield P.mapSeries(_.range(3), idx => parent.sendAndReceive('test', { shard: 2, value: idx }));

    var result = yield parent.broadcastAndReceive('getReceived');

    expect(result).to.have.deep.members([
      [
        { shard: 0, value: 1 }
      ],
      [
        { shard: 1, value: 0 },
        { shard: 1, value: 1 }
      ],
      [
        { shard: 2, value: 0 },
        { shard: 2, value: 1 },
        { shard: 2, value: 2 }
      ]
    ]);
  }));

  it('should call "clusterChanged" on custom balancer if a child goes offline and online', P.coroutine(function*() {
    /**
     * Child actor.
     */
    class Child {
      initialize(selfActor) {
        this.id = selfActor.getId();
      }

      test() {
        return this.id;
      }

      kill() {
        process.exit(1);
      }
    }

    var numberOfClusterChanges = 0;

    /**
     * Custom balancer. Always routes to a single actor in the
     * cluster that happens to be the first in clusterChanged() hook.
     */
    class CustomBalancer {
      clusterChanged(actors) {
        this.currentId = actors[0].getId();
        numberOfClusterChanges++;
      }

      forward(topic, msg) {
        return this.currentId;
      }
    }

    // Define custom system with our test balancer.
    yield system.destroy();
    system = actors({
      test: true,
      balancers: [CustomBalancer]
    });
    rootActor = yield system.rootActor();

    // Create clustered actor with custom balancer.
    var parent = yield rootActor.createChild(Child, {
      mode: 'forked',
      clusterSize: 3,
      balancer: 'CustomBalancer',
      onCrash: 'respawn'
    });

    var currentId = yield parent.sendAndReceive('test');

    parent.send('kill');

    yield tu.waitForCondition(() => parent.sendAndReceive('test').then(id => id != currentId));

    yield tu.waitForCondition(() => numberOfClusterChanges == 2);
  }));

  it('should support empty "forward" response on custom balancer', P.coroutine(function*() {
    /**
     * Custom balancer.
     */
    class CustomBalancer {
      forward(topic, msg) {
        // Return nothing.
      }
    }

    // Define custom system with our test balancer.
    yield system.destroy();
    system = actors({
      test: true,
      balancers: [CustomBalancer]
    });
    rootActor = yield system.rootActor();

    // Create clustered actor with custom balancer.
    var parent = yield rootActor.createChild({}, {
      mode: 'forked',
      clusterSize: 3,
      balancer: 'CustomBalancer'
    });

    var error;

    yield parent.sendAndReceive('test', { shard: 0, value: 1 }).catch(err => {
      error = err;
    });

    expect(error).to.be.an.instanceof(Error);
    expect(error.message).to.match(/No child to forward message to./);
  }));

  it('should generate proper error if forward() returned non-existing child ID');

  it('should properly destroy it\'s children', P.coroutine(function*() {
    var initializeCounter = 0;
    var destroyCounter = 0;

    /**
     * Child actor.
     */
    class Child {
      initialize() {
        initializeCounter++;
      }

      destroy() {
        destroyCounter++;
      }
    }

    /**
     * Custom balancer.
     */
    class CustomBalancer {
      clusterChanged(actors) {
        this.actors = actors;
      }

      forward(topic, msg) {
        var _ = require('underscore');
        var idx = _.random(this.actors.length);

        return this.actors[idx];
      }
    }

    // Define custom system with our test balancer.
    var system = actors({
      test: true,
      balancers: [CustomBalancer]
    });
    var rootActor = yield system.rootActor();

    // Create clustered actor with custom balancer.
    var parent = yield rootActor.createChild(Child, {
      mode: 'in-memory',
      clusterSize: 3,
      balancer: 'CustomBalancer'
    });

    expect(initializeCounter).to.be.equal(3);
    expect(destroyCounter).to.be.equal(0);

    yield parent.destroy();

    expect(initializeCounter).to.be.equal(3);
    expect(destroyCounter).to.be.equal(3);
  }));

  describe('forked mode', function() {
    it('should properly clusterize with round robin balancing strategy', P.coroutine(function*() {
      var childDef = {
        getPid: () => process.pid
      };

      // This should create local router and 3 sub-processes.
      var router = yield rootActor.createChild(childDef, { mode: 'forked', clusterSize: 3 });

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

      expect(_.keys(metrics)).to.have.members(['0', '1', '2', 'summary']);
      expect(_.values(metrics)).to.have.deep.members([
        { count: 1 },
        { count: 1 },
        { count: 1 },
        { count: 3 }
      ]);
      expect(metrics.summary).to.be.deep.equal({ count: 3 });
    }));

    it('should return clustered actor mode from actor object', P.coroutine(function*() {
      var childDef = {
        getPid: () => process.pid
      };

      // This should create local router and 3 sub-processes.
      var router = yield rootActor.createChild(childDef, { mode: 'forked', clusterSize: 3 });

      expect(router.getMode()).to.be.equal('forked');
    }));

    it('should be able to broadcast messages to all clustered actors', P.coroutine(function*() {
      /**
       * Test child definition.
       */
      class Child {
        constructor() {
          this.count = 0;
        }

        increment() {
          this.count++;
        }

        get() {
          return this.count;
        }
      }

      var router = yield rootActor.createChild(Child, { mode: 'forked', clusterSize: 3 });

      yield router.broadcast('increment');

      var results = yield router.broadcastAndReceive('get');

      expect(results).to.have.members([1, 1, 1]);
    }));

    it('should correctly broadcast to non-clustered actor', P.coroutine(function*() {
      /**
       * Test child definition.
       */
      class Child {
        constructor() {
          this.count = 0;
        }

        increment() {
          this.count++;
        }

        get() {
          return this.count;
        }
      }

      var router = yield rootActor.createChild(Child, { mode: 'in-memory', clusterSize: 1 });

      yield router.broadcast('increment');

      var results = yield router.broadcastAndReceive('get');

      expect(results).to.have.members([1]);
    }));

    it('should not send messages to crashed forked actors', P.coroutine(function*() {
      // Define test behaviour.
      var def = {
        kill: () => {
          process.exit(1);
        },

        getPid: () => process.pid
      };

      // Create clustered forked actor.
      var actor = yield rootActor.createChild(def, { mode: 'forked', clusterSize: 2 });

      // Get child actor PIDs.
      var pids = yield P.map(_.range(2), () => actor.sendAndReceive('getPid'));

      // Kill first child.
      yield actor.send('kill');

      // Wait for child to die.
      yield tu.waitForCondition(() => !isRunning(pids[0]));

      // Send getPid message again. Second PID should be received.
      var pid2 = yield actor.sendAndReceive('getPid');

      expect(pid2).to.be.equal(pids[1]);

      // Send getPid message again. First actor should be skipped as crashed.
      var pid = yield actor.sendAndReceive('getPid');

      expect(pid).to.be.equal(pids[1]);
    }));
  });

  describe('remote mode', function() {
    var remoteSystem;

    beforeEach(function() {
      remoteSystem = actors({
        test: true,
        additionalRequires: 'ts-node/register'
      });

      return remoteSystem.listen();
    });

    afterEach(function() {
      return remoteSystem.destroy();
    });

    it('should not send messages to crashed remote actors', P.coroutine(function*() {
      // Define test behaviour.
      var def = {
        kill: () => {
          process.exit(1);
        },

        getPid: () => process.pid
      };

      // Create clustered forked actor.
      var actor = yield rootActor.createChild(def, {
        mode: 'remote',
        host: '127.0.0.1',
        clusterSize: 2
      });

      // Get child actor PIDs.
      var pids = yield P.map(_.range(2), () => actor.sendAndReceive('getPid'));

      // Kill first child.
      yield actor.send('kill');

      // Wait for child to die.
      yield tu.waitForCondition(() => !isRunning(pids[0]));

      // Send getPid message again. Second PID should be received.
      var pid2 = yield actor.sendAndReceive('getPid');

      expect(pid2).to.be.equal(pids[1]);

      // Send getPid message again. First actor should be skipped as crashed.
      var pid = yield actor.sendAndReceive('getPid');

      expect(pid).to.be.equal(pids[1]);
    }));
  });
});