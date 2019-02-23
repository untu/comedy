/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */
import {Actor, ActorRef, ActorSystem, ParentActorRef} from '../../index';
import {afterEach} from 'mocha';
import * as tu from '../../lib/utils/test';
import * as actors from '../../index';
import {expect} from 'chai';
import * as isRunning from 'is-running';
import * as P from 'bluebird';
import * as _ from 'underscore';

let system: ActorSystem;
let rootActor: Actor;

describe('ClusteredActor', function () {
  beforeEach(function () {
    system = actors.createSystem({test: true});

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  afterEach(function () {
    return system.destroy();
  });

  it('should correctly receive messages to parent reference from children', async function () {
    /**
     * Test child behaviour class.
     */
    class ChildBehaviour {
      private parent: ParentActorRef;

      initialize(selfActor: Actor) {
        this.parent = selfActor.getParent();
      }

      hello() {
        // @ts-ignore
        return this.parent.sendAndReceive('helloReceived').return('Hello!');
      }
    }

    /**
     * Test parent behaviour class.
     */
    class ParentBehaviour {
      private helloReceivedCount: number;
      private child: ActorRef;

      constructor() {
        this.helloReceivedCount = 0;
      }

      async initialize(selfActor: Actor) {
        this.child = await selfActor.createChild(ChildBehaviour, {mode: 'forked', clusterSize: 2});
      }

      helloToChild() {
        return this.child.sendAndReceive('hello');
      }

      helloReceived() {
        this.helloReceivedCount++;
      }

      getHelloReceivedCount() {
        return this.helloReceivedCount;
      }
    }

    let parent = await rootActor.createChild(ParentBehaviour);

    await parent.sendAndReceive('helloToChild');

    let helloReceivedCount = await parent.sendAndReceive('getHelloReceivedCount');

    expect(helloReceivedCount).to.be.equal(1);
  });

  it('should support random balancer', async function () {
    /**
     * Child definition.
     */
    class Child {
      private id: string;

      initialize(selfActor: Actor) {
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
      private router: ActorRef;

      async initialize(selfActor: Actor) {
        this.router = await selfActor.createChild(Child, {
          mode: 'forked',
          clusterSize: 2,
          balancer: 'random'
        });
      }

      async test() {
        let counters: any = {};
        let maxDelta = 0;

        for (let i = 0; i < 100; i++) {
          let from = await this.router.sendAndReceive('test');
          // tslint:disable-next-line
          counters[from] && counters[from]++ || (counters[from] = 1);

          let curDelta = _.reduce(counters, (memo: number, value: number) => Math.abs(value - memo), 0);

          maxDelta = Math.max(maxDelta, curDelta);
        }

        expect(maxDelta).to.be.within(2, 99);
      }
    }

    let parent = await rootActor.createChild(Parent);

    await parent.sendAndReceive('test');
  });

  it('should support custom balancers', async function () {
    /**
     * Child actor.
     */
    class Child {
      private readonly received: object[];

      constructor() {
        this.received = [];
      }

      test(msg: object) {
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
      private table: any[][];

      clusterChanged(actors: Actor[]) {
        let _ = require('underscore');

        this.table = _.chain(actors).map((actor: Actor) => actor.getId()).sortBy().value();
      }

      forward(topic: string, msg: any) {
        let tableIdx = msg.shard % this.table.length;

        return this.table[tableIdx];
      }
    }

    // Define custom system with our test balancer.
    await system.destroy();
    system = actors.createSystem({
      test: true,
      balancers: [CustomBalancer]
    });
    rootActor = await system.rootActor();

    // Create clustered actor with custom balancer.
    let parent = await rootActor.createChild(Child, {
      mode: 'forked',
      clusterSize: 3,
      balancer: 'CustomBalancer'
    });

    await parent.sendAndReceive('test', {shard: 0, value: 1});
    await P.mapSeries(_.range(2), idx => parent.sendAndReceive('test', {shard: 1, value: idx}));
    await P.mapSeries(_.range(3), idx => parent.sendAndReceive('test', {shard: 2, value: idx}));

    let result = await parent.broadcastAndReceive('getReceived');

    expect(result).to.have.deep.members([
      [
        {shard: 0, value: 1}
      ],
      [
        {shard: 1, value: 0},
        {shard: 1, value: 1}
      ],
      [
        {shard: 2, value: 0},
        {shard: 2, value: 1},
        {shard: 2, value: 2}
      ]
    ]);
  });

  it('should call "clusterChanged" on custom balancer if a child goes offline and online', async function () {
    /**
     * Child actor.
     */
    class Child {
      private id: string;

      initialize(selfActor: Actor) {
        this.id = selfActor.getId();
      }

      test() {
        return this.id;
      }

      kill() {
        process.exit(1);
      }
    }

    let numberOfClusterChanges = 0;

    /**
     * Custom balancer. Always routes to a single actor in the
     * cluster that happens to be the first in clusterChanged() hook.
     */
    class CustomBalancer {
      private currentId: string;

      clusterChanged(actors: Actor[]) {
        this.currentId = actors[0].getId();
        numberOfClusterChanges++;
      }

      forward(topic: string, msg: any) {
        return this.currentId;
      }
    }

    // Define custom system with our test balancer.
    await system.destroy();
    system = actors.createSystem({
      test: true,
      balancers: [CustomBalancer]
    });
    rootActor = await system.rootActor();

    // Create clustered actor with custom balancer.
    let parent = await rootActor.createChild(Child, {
      mode: 'forked',
      clusterSize: 3,
      balancer: 'CustomBalancer',
      onCrash: 'respawn'
    });

    let currentId = await parent.sendAndReceive('test');

    parent.send('kill');

    await tu.waitForCondition(() => parent.sendAndReceive('test').then(id => id != currentId));

    await tu.waitForCondition(() => numberOfClusterChanges == 2);
  });

  it('should support empty "forward" response on custom balancer', async function () {
    try {
      /**
       * Custom balancer.
       */
      class CustomBalancer {
        forward(topic: string, msg: any) {
          // Return nothing.
        }
      }

      // Define custom system with our test balancer.
      await system.destroy();
      system = actors.createSystem({
        test: true,
        balancers: [CustomBalancer]
      });
      rootActor = await system.rootActor();

      // Create clustered actor with custom balancer.
      let parent = await rootActor.createChild({}, {
        mode: 'forked',
        clusterSize: 3,
        balancer: 'CustomBalancer'
      });

      await parent.sendAndReceive('test', {shard: 0, value: 1});
    } catch (err) {
      expect(err).to.be.an.instanceof(Error);
      expect(err.message).to.match(/No child to forward message to./);
    }
  });

  it('should generate proper error if forward() returned non-existing child ID', async function () {
    try {
      /**
       * Custom balancer.
       */
      class CustomBalancer {
        forward(topic: string, msg: any) {
          // Return absent ID.
          return '123456';
        }
      }

      // Define custom system with our test balancer.
      await system.destroy();
      system = actors.createSystem({
        test: true,
        balancers: [CustomBalancer]
      });
      rootActor = await system.rootActor();

      // Create clustered actor with custom balancer.
      let parent = await rootActor.createChild({}, {
        mode: 'forked',
        clusterSize: 3,
        balancer: 'CustomBalancer'
      });

      await parent.sendAndReceive('test', {shard: 0, value: 1});
    } catch (err) {
      expect(err).to.be.an.instanceof(Error);
      expect(err.message).to.match(/No child to forward message to./);
    }
  });

  it('should properly destroy it\'s children', async function () {
    let initializeCounter = 0;
    let destroyCounter = 0;

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
      private actors: Actor[];

      clusterChanged(actors: Actor[]) {
        this.actors = actors;
      }

      forward(topic: string, msg: any) {
        let _ = require('underscore');
        let idx = _.random(this.actors.length);

        return this.actors[idx];
      }
    }

    // Define custom system with our test balancer.
    let system = actors.createSystem({
      test: true,
      balancers: [CustomBalancer]
    });
    let rootActor = await system.rootActor();

    // Create clustered actor with custom balancer.
    let parent = await rootActor.createChild(Child, {
      mode: 'in-memory',
      clusterSize: 3,
      balancer: 'CustomBalancer'
    });

    expect(initializeCounter).to.be.equal(3);
    expect(destroyCounter).to.be.equal(0);

    await parent.destroy();

    expect(initializeCounter).to.be.equal(3);
    expect(destroyCounter).to.be.equal(3);
  });

  describe('forked mode', function () {
    it('should properly clusterize with round robin balancing strategy', async function () {
      let childDef = {
        getPid: () => process.pid
      };

      // This should create local router and 3 sub-processes.
      let router = await rootActor.createChild(childDef, {mode: 'forked', clusterSize: 3});

      let promises = _.times(6, () => router.sendAndReceive('getPid'));
      let results = await P.all(promises);

      // Results should be separate process PIDs.
      _.each(results, result => {
        expect(result).to.be.a('number');
        expect(result).to.be.not.equal(process.pid);
      });

      // Checks results of round-robin logic.
      _.times(3, idx => {
        expect(results[idx]).to.be.equal(results[idx + 3]);
      });
    });

    it('should gather metrics from clustered child actors', async function () {
      /**
       * Test child behaviour class.
       */
      class ChildBehaviour {
        metrics() {
          return {count: 1};
        }
      }

      let router = await rootActor.createChild(ChildBehaviour, {mode: 'forked', clusterSize: 3});

      let metrics = await router.metrics();

      expect(_.keys(metrics)).to.have.members(['0', '1', '2', 'summary']);
      expect(_.values(metrics)).to.have.deep.members([
        {count: 1},
        {count: 1},
        {count: 1},
        {count: 3}
      ]);
      expect(metrics.summary).to.be.deep.equal({count: 3});
    });

    it('should return clustered actor mode from actor object', async function () {
      let childDef = {
        getPid: () => process.pid
      };

      // This should create local router and 3 sub-processes.
      let router = await rootActor.createChild(childDef, {mode: 'forked', clusterSize: 3});

      expect(router.getMode()).to.be.equal('forked');
    });

    it('should be able to broadcast messages to all clustered actors', async function () {
      /**
       * Test child definition.
       */
      class Child {
        private count: number;

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

      let router = await rootActor.createChild(Child, {mode: 'forked', clusterSize: 3});

      await router.broadcastAndReceive('increment');

      let results = await router.broadcastAndReceive('get');

      expect(results).to.have.members([1, 1, 1]);
    });

    it('should correctly broadcast to non-clustered actor', async function () {
      /**
       * Test child definition.
       */
      class Child {
        private count: number;

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

      let router = await rootActor.createChild(Child, {mode: 'in-memory', clusterSize: 1});

      await router.broadcast('increment');

      let results = await router.broadcastAndReceive('get');

      expect(results).to.have.members([1]);
    });

    it('should not send messages to crashed forked actors', async function () {
      // Define test behaviour.
      let def = {
        kill: () => {
          process.exit(1);
        },

        getPid: () => process.pid
      };

      // Create clustered forked actor.
      let actor = await rootActor.createChild(def, {mode: 'forked', clusterSize: 2});

      // Get child actor PIDs.
      let pids = await P.map(_.range(2), () => actor.sendAndReceive('getPid'));

      // Kill first child.
      await actor.send('kill');

      // Wait for child to die.
      await tu.waitForCondition(() => !isRunning(pids[0]));

      // Send getPid message again. Second PID should be received.
      let pid2 = await actor.sendAndReceive('getPid');

      expect(pid2).to.be.equal(pids[1]);

      // Send getPid message again. First actor should be skipped as crashed.
      let pid = await actor.sendAndReceive('getPid');

      expect(pid).to.be.equal(pids[1]);
    });
  });

  describe('remote mode', function () {
    let remoteSystem: ActorSystem;

    beforeEach(function () {
      remoteSystem = actors.createSystem({
        test: true,
        additionalRequires: 'ts-node/register'
      });

      return remoteSystem.listen();
    });

    afterEach(function () {
      return remoteSystem.destroy();
    });

    it('should not send messages to crashed remote actors', async function () {
      // Define test behaviour.
      let def = {
        kill: () => {
          process.exit(1);
        },

        getPid: () => process.pid
      };

      // Create clustered forked actor.
      let actor = await rootActor.createChild(def, {
        mode: 'remote',
        host: '127.0.0.1',
        clusterSize: 2
      });

      // Get child actor PIDs.
      let pids = await P.map(_.range(2), () => actor.sendAndReceive('getPid'));

      // Kill first child.
      await actor.send('kill');

      // Wait for child to die.
      await tu.waitForCondition(() => !isRunning(pids[0]));

      // Send getPid message again. Second PID should be received.
      let pid2 = await actor.sendAndReceive('getPid');

      expect(pid2).to.be.equal(pids[1]);

      // Send getPid message again. First actor should be skipped as crashed.
      let pid = await actor.sendAndReceive('getPid');

      expect(pid).to.be.equal(pids[1]);
    });
  });
});
