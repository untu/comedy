/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

/* eslint require-jsdoc: "off" */

import * as actors from '../../';
import {expect} from 'chai';
import { Actor, ActorDefinition, ActorRef, ActorSystem } from '../../index';
import {afterEach, beforeEach} from 'mocha';
import * as common from '../../lib/utils/common';
import _ = require('underscore');

let system: ActorSystem;
let rootActor: Actor;

describe('Hot configuration change', () => {
  beforeEach(() => {
    system = actors.createSystem({
      test: true,
      additionalRequires: 'ts-node/register'
    });

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  afterEach(() => system.destroy());

  describe('changeConfiguration()', () => {
    it('should be able to programmatically change actor mode ("in-memory" -> "forked")', async () => {
      let testActor = await rootActor.createChild({
        test: () => process.pid
      }, { mode: 'in-memory' });

      let localPid = await testActor.sendAndReceive('test');

      expect(localPid).to.be.a('number');

      await testActor.changeConfiguration({ mode: 'forked' });

      let forkedPid = await testActor.sendAndReceive('test');

      expect(forkedPid).to.be.a('number');
      expect(forkedPid).to.be.not.equal(localPid);

      await testActor.changeConfiguration({ mode: 'in-memory' });

      let localPid2 = await testActor.sendAndReceive('test');

      expect(localPid2).to.be.equal(localPid);
    });

    it('should be able to programmatically change actor mode ("forked" -> "in-memory")', async () => {
      let testActor = await rootActor.createChild({
        test: () => process.pid
      }, { mode: 'forked' });

      let forkedPid = await testActor.sendAndReceive('test');

      expect(forkedPid).to.be.a('number');
      expect(forkedPid).to.be.not.equal(process.pid);

      await testActor.changeConfiguration({ mode: 'in-memory' });

      let localPid = await testActor.sendAndReceive('test');

      expect(localPid).to.be.a('number');
      expect(localPid).to.be.equal(process.pid);

      await testActor.changeConfiguration({ mode: 'forked' });

      let forkedPid2 = await testActor.sendAndReceive('test');

      expect(forkedPid2).to.be.a('number');
      expect(forkedPid2).to.be.not.equal(process.pid);
      expect(forkedPid2).to.be.not.equal(forkedPid);
    });

    it('should be able to programmatically change clustering mode in "in-memory" mode', async () => {
      let mode = 'in-memory';
      let pidCounter = 1;
      let testActor = await rootActor.createChild({
        initialize: function() {
          this.pid = pidCounter++;
        },

        test: function() {
          return this.pid;
        }
      }, { mode });

      let pid = await testActor.sendAndReceive('test');

      expect(pid).to.be.equal(1);

      await testActor.changeConfiguration({ mode, clusterSize: 2 });

      let pid1 = await testActor.sendAndReceive('test');
      let pid2 = await testActor.sendAndReceive('test');

      expect(pid1).to.be.equal(2);
      expect(pid2).to.be.equal(3);

      await testActor.changeConfiguration({ mode, clusterSize: 3 });

      let pid3 = await testActor.sendAndReceive('test');

      expect(pid3).to.be.equal(4);

      let pid11 = await testActor.sendAndReceive('test');

      expect(pid11).to.be.equal(pid1);

      let pid22 = await testActor.sendAndReceive('test');

      expect(pid22).to.be.equal(pid2);

      await testActor.changeConfiguration({ mode, clusterSize: 2 });

      let pid222 = await testActor.sendAndReceive('test');

      expect(pid222).to.be.equal(pid2);

      let pid33 = await testActor.sendAndReceive('test');

      expect(pid33).to.be.equal(pid3);

      await testActor.changeConfiguration({ mode });

      let finalPid = await testActor.sendAndReceive('test');

      expect(finalPid).to.be.equal(5);
    });

    it('should be able to programmatically change clustering mode in "forked" mode', async () => {
      let mode = 'forked';
      let testActor = await rootActor.createChild({
        test: () => process.pid
      }, { mode });

      let forkedPid = await testActor.sendAndReceive('test');

      expect(forkedPid).to.be.a('number');
      expect(forkedPid).to.be.not.equal(process.pid);

      await testActor.changeConfiguration({ mode, clusterSize: 2 });

      let pid1 = await testActor.sendAndReceive('test');
      let pid2 = await testActor.sendAndReceive('test');

      expect(pid1).to.be.a('number');
      expect(pid1).to.be.not.equal(forkedPid);
      expect(pid2).to.be.a('number');
      expect(pid2).to.be.not.equal(forkedPid);
      expect(pid2).to.be.not.equal(pid1);

      await testActor.changeConfiguration({ mode, clusterSize: 3 });

      let pid3 = await testActor.sendAndReceive('test');

      expect(pid3).to.be.a('number');
      expect(pid3).to.be.not.equal(pid1);
      expect(pid3).to.be.not.equal(pid2);

      let pid11 = await testActor.sendAndReceive('test');

      expect(pid11).to.be.equal(pid1);

      let pid22 = await testActor.sendAndReceive('test');

      expect(pid22).to.be.equal(pid2);

      await testActor.changeConfiguration({ mode, clusterSize: 2 });

      let pid222 = await testActor.sendAndReceive('test');

      expect(pid222).to.be.equal(pid2);

      let pid33 = await testActor.sendAndReceive('test');

      expect(pid33).to.be.equal(pid3);

      await testActor.changeConfiguration({ mode });

      let finalPid = await testActor.sendAndReceive('test');

      expect(finalPid).to.be.a('number');
      expect(finalPid).to.be.not.equal(pid1);
      expect(finalPid).to.be.not.equal(pid2);
      expect(finalPid).to.be.not.equal(pid3);
    });

    it('should respect custom parameters', async () => {
      class TestActor implements ActorDefinition {
        private selfActor: Actor;

        initialize(selfActor: Actor): void {
          this.selfActor = selfActor;
        }

        test() {
          return `${this.selfActor.getCustomParameters().greeting} ${process.pid}`;
        }

        destroy(): void {
          // Nothing to do.
        }
      }

      let testActor = await rootActor.createChild(TestActor, {
        mode: 'in-memory',
        customParameters: {
          greeting: 'Hello!'
        }
      });

      let message = await testActor.sendAndReceive('test');

      expect(message).to.match(/Hello! \d+/);

      await testActor.changeConfiguration({ mode: 'forked' });

      let forkedMessage = await testActor.sendAndReceive('test');

      expect(forkedMessage).to.match(/Hello! \d+/);
      expect(forkedMessage).to.be.not.equal(message);
    });
  });

  describe('changeGlobalConfiguration()', () => {
    let parentActor: ActorRef;

    beforeEach(async function() {
      parentActor = await rootActor.createChild({
        async initialize(selfActor: Actor) {
          this.mode = selfActor.getMode();
          this.child1 = await selfActor.createChild({
            initialize: async function(selfActor: Actor) {
              this.mode = selfActor.getMode();

              this.child = await selfActor.createChild({}, { name: 'SubChild' });
            },

            collectModes: function() {
              return {
                self: this.mode,
                children: [{ self: this.child.getMode() }]
              };
            }
          }, { name: 'Child1' });
          this.child2 = await selfActor.createChild({
            initialize: function(selfActor: Actor) {
              this.mode = selfActor.getMode();
            },

            collectModes: function() {
              return {
                self: this.mode
              };
            }
          }, { name: 'Child2' });
        },

        async collectModes() {
          return {
            self: this.mode,
            children: [
              await this.child1.sendAndReceive('collectModes'),
              await this.child2.sendAndReceive('collectModes')
            ]
          };
        }
      }, { name: 'Parent' });
    });

    it('should change global actor configuration for actor and it\'s children', async () => {
      let modes1 = await parentActor.sendAndReceive('collectModes');

      expect(modes1).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'in-memory',
            children: [{ self: 'in-memory' }]
          },
          { self: 'in-memory' }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        SomeOtherActor: { mode: 'forked' }
      });

      let modes2 = await parentActor.sendAndReceive('collectModes');

      expect(modes2).to.be.deep.equal(modes1);

      await parentActor.changeGlobalConfiguration({
        SubChild: { mode: 'forked' },
        SomeOtherActor: { mode: 'forked' }
      });

      let modes3 = await parentActor.sendAndReceive('collectModes');

      expect(modes3).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'in-memory',
            children: [{ self: 'forked' }]
          },
          { self: 'in-memory' }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'forked' },
        SubChild: { mode: 'in-memory' }
      });

      let modes4 = await parentActor.sendAndReceive('collectModes');

      expect(modes4).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'forked',
            children: [{ self: 'in-memory' }]
          },
          { self: 'in-memory' }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'forked' },
        SubChild: { mode: 'forked' }
      });

      let modes5 = await parentActor.sendAndReceive('collectModes');

      expect(modes5).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'forked',
            children: [{ self: 'forked' }]
          },
          { self: 'in-memory' }
        ]
      });
    });

    it('should change global actor configuration recursively', async () => {
      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'forked' },
        SubChild: { mode: 'forked' }
      });

      let modes = await parentActor.sendAndReceive('collectModes');

      expect(modes).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'forked',
            children: [{ self: 'forked' }]
          },
          { self: 'in-memory' }
        ]
      });
    });

    it('should work for "threaded" mode', async () => {
      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'threaded' }
      });

      let modes = await parentActor.sendAndReceive('collectModes');

      expect(modes).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'threaded',
            children: [{ self: 'in-memory' }]
          },
          { self: 'in-memory' }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'threaded' },
        SubChild: { mode: 'threaded' },
      });

      let modes2 = await parentActor.sendAndReceive('collectModes');

      expect(modes2).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'threaded',
            children: [{ self: 'threaded' }]
          },
          { self: 'in-memory' }
        ]
      });
    });

    it('should work for "remote" mode', async () => {
      let remoteSystem = actors.createSystem({
        test: true,
        additionalRequires: 'ts-node/register'
      });

      try {
        await remoteSystem.listen();

        await parentActor.changeGlobalConfiguration({
          Child1: { mode: 'remote', host: '127.0.0.1' }
        });

        let modes = await parentActor.sendAndReceive('collectModes');

        expect(modes).to.be.deep.equal({
          self: 'in-memory',
          children: [
            {
              self: 'remote',
              children: [{ self: 'in-memory' }]
            },
            { self: 'in-memory' }
          ]
        });

        await parentActor.changeGlobalConfiguration({
          Child1: { mode: 'remote', host: '127.0.0.1' },
          SubChild: { mode: 'remote', host: '127.0.0.1' }
        });

        let modes2 = await parentActor.sendAndReceive('collectModes');

        expect(modes2).to.be.deep.equal({
          self: 'in-memory',
          children: [
            {
              self: 'remote',
              children: [{ self: 'remote' }]
            },
            { self: 'in-memory' }
          ]
        });
      }
      finally {
        await remoteSystem.destroy();
      }
    });

    it('should correctly change clustering settings (scale up)', async () => {
      let modes1 = await parentActor.sendAndReceive('collectModes');

      expect(modes1).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'in-memory',
            children: [{ self: 'in-memory' }]
          },
          { self: 'in-memory' }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'forked' }
      });

      let modes2 = await parentActor.sendAndReceive('collectModes');

      expect(modes2).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'forked',
            children: [{ self: 'in-memory' }]
          },
          { self: 'in-memory' }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'forked', clusterSize: 2 }
      });

      let tree = await parentActor.tree();

      let tree0 = common.transformObjectRecursive(tree, (value, key) => {
        return _.contains(['name', 'mode', 'children'], key);
      });

      expect(tree0).to.be.deep.equal({
        name: 'Parent',
        mode: 'in-memory',
        location: {},
        children: [
          {
            name: 'Child1RoundRobinBalancer',
            mode: 'forked',
            location: {},
            children: [
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              },
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              }
            ]
          },
          {
            name: 'Child2',
            mode: 'in-memory',
            location: {}
          }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'forked', clusterSize: 3 }
      });

      let tree2 = await parentActor.tree();

      let tree02 = common.transformObjectRecursive(tree2, (value, key) => {
        return _.contains(['name', 'mode', 'children'], key);
      });

      expect(tree02).to.be.deep.equal({
        name: 'Parent',
        mode: 'in-memory',
        location: {},
        children: [
          {
            name: 'Child1RoundRobinBalancer',
            mode: 'forked',
            location: {},
            children: [
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              },
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              },
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              }
            ]
          },
          {
            name: 'Child2',
            mode: 'in-memory',
            location: {}
          }
        ]
      });
    });

    it('should correctly change clustering settings (scale down)', async () => {
      let modes1 = await parentActor.sendAndReceive('collectModes');

      expect(modes1).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'in-memory',
            children: [{ self: 'in-memory' }]
          },
          { self: 'in-memory' }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'forked', clusterSize: 3 }
      });

      let tree1 = await parentActor.tree();

      let tree01 = common.transformObjectRecursive(tree1, (value, key) => {
        return _.contains(['name', 'mode', 'children'], key);
      });

      expect(tree01).to.be.deep.equal({
        name: 'Parent',
        mode: 'in-memory',
        location: {},
        children: [
          {
            name: 'Child1RoundRobinBalancer',
            mode: 'forked',
            location: {},
            children: [
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              },
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              },
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              }
            ]
          },
          {
            name: 'Child2',
            mode: 'in-memory',
            location: {}
          }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'forked', clusterSize: 2 }
      });

      let tree2 = await parentActor.tree();

      let tree02 = common.transformObjectRecursive(tree2, (value, key) => {
        return _.contains(['name', 'mode', 'children'], key);
      });

      expect(tree02).to.be.deep.equal({
        name: 'Parent',
        mode: 'in-memory',
        location: {},
        children: [
          {
            name: 'Child1RoundRobinBalancer',
            mode: 'forked',
            location: {},
            children: [
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              },
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              }
            ]
          },
          {
            name: 'Child2',
            mode: 'in-memory',
            location: {}
          }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'forked', clusterSize: 1 }
      });

      let tree3 = await parentActor.tree();

      let tree03 = common.transformObjectRecursive(tree3, (value, key) => {
        return _.contains(['name', 'mode', 'children'], key);
      });

      expect(tree03).to.be.deep.equal({
        name: 'Parent',
        mode: 'in-memory',
        location: {},
        children: [
          {
            name: 'Child1RoundRobinBalancer',
            mode: 'forked',
            location: {},
            children: [
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              }
            ]
          },
          {
            name: 'Child2',
            mode: 'in-memory',
            location: {}
          }
        ]
      });
    });

    it('should correctly change scaled mode', async () => {
      await parentActor.changeGlobalConfiguration({
        Child1: {
          mode: 'threaded',
          clusterSize: 2
        }
      });

      let tree1 = await parentActor.tree();

      let tree01 = common.transformObjectRecursive(tree1, (value, key) => {
        return _.contains(['name', 'mode', 'children'], key);
      });

      expect(tree01).to.be.deep.equal({
        name: 'Parent',
        mode: 'in-memory',
        location: {},
        children: [
          {
            name: 'Child1RoundRobinBalancer',
            mode: 'threaded',
            location: {},
            children: [
              {
                name: 'Child1',
                mode: 'threaded',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              },
              {
                name: 'Child1',
                mode: 'threaded',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              }
            ]
          },
          {
            name: 'Child2',
            mode: 'in-memory',
            location: {}
          }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'forked', clusterSize: 2 }
      });

      let tree2 = await parentActor.tree();

      let tree02 = common.transformObjectRecursive(tree2, (value, key) => {
        return _.contains(['name', 'mode', 'children'], key);
      });

      expect(tree02).to.be.deep.equal({
        name: 'Parent',
        mode: 'in-memory',
        location: {},
        children: [
          {
            name: 'Child1RoundRobinBalancer',
            mode: 'forked',
            location: {},
            children: [
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              },
              {
                name: 'Child1',
                mode: 'forked',
                location: {},
                children: [
                  {
                    name: 'SubChild',
                    mode: 'in-memory',
                    location: {}
                  }
                ]
              }
            ]
          },
          {
            name: 'Child2',
            mode: 'in-memory',
            location: {}
          }
        ]
      });
    });

    it('should use "in-memory" mode by default', async () => {
      let modes1 = await parentActor.sendAndReceive('collectModes');

      expect(modes1).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'in-memory',
            children: [{ self: 'in-memory' }]
          },
          { self: 'in-memory' }
        ]
      });

      await parentActor.changeGlobalConfiguration({
        Child1: { mode: 'forked' }
      });

      let modes2 = await parentActor.sendAndReceive('collectModes');

      expect(modes2).to.be.deep.equal({
        self: 'in-memory',
        children: [
          {
            self: 'forked',
            children: [{ self: 'in-memory' }]
          },
          { self: 'in-memory' }
        ]
      });

      await parentActor.changeGlobalConfiguration({});

      let modes3 = await parentActor.sendAndReceive('collectModes');

      expect(modes3).to.be.deep.equal(modes1);
    });

    it('should correctly scale-up module-defined actors', async () => {
      let moduleDefinedActor = await rootActor.createChild('/test-resources/actors/test-actor', {
        mode: 'forked',
        clusterSize: 2
      });

      let responses1 = await moduleDefinedActor.broadcastAndReceive('hello', 1);

      expect(responses1).to.have.length(2);

      await rootActor.changeGlobalConfiguration({
        TestActor: {
          mode: 'forked',
          clusterSize: 3
        }
      });

      let responses2 = await moduleDefinedActor.broadcastAndReceive('hello', 2);

      expect(responses2).to.have.length(3);
    });
  });
});
