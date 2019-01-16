/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

/* eslint require-jsdoc: "off" */

import * as actors from '../../';
import {expect} from 'chai';
import {Actor, ActorSystem} from '../../index';
import P = require('bluebird');
import _ = require('underscore');
import {describe, afterEach, beforeEach, it} from 'mocha';

let system: ActorSystem;
let rootActor: Actor;

describe('InMemoryActor (TypeScript)', function() {
  beforeEach(function() {
    system = actors.createSystem({
      test: true,
      additionalRequires: 'ts-node/register'
    });

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  afterEach(function() {
    return system.destroy();
  });

  describe('initialize()', function() {
    it('should not receive messages until initialized', async function() {
      class LongStartingActor {
        initialize(selfActor: Actor) {
          return selfActor
            .createChild({
              initialize: function(selfActor) {
                // This should throw error as parent has not yet been initialized.
                return selfActor.getParent().send('hello', 'Child');
              }
            });
        }

        hello(to: string) {
          return `Hello to ${to}`;
        }
      }

      let err: any = undefined;

      try {
        await rootActor.createChild(LongStartingActor);
      }
      catch (err0) {
        err = err0;
      }

      expect(err).to.be.not.equal(undefined);
      expect(err.message).to.match(/Actor has not yet been initialized\./);
    });
  });

  describe('send()', function() {
    it('should send a message to an actor', function() {
      let externalState = 0;

      return rootActor
        .createChild({
          myMessage: (msg: any) => {
            externalState += msg.count;
          }
        })
        .then(testActor => testActor.send('myMessage', { count: 3 }))
        .then(() => {
          expect(externalState).to.be.equal(3);
        });
    });

    it('should allow additional arguments', function() {
      let result = 0;

      return rootActor
        .createChild({
          calculateSum: (left: number, right: number) => result = left + right
        })
        .then(actor => actor.sendAndReceive('calculateSum', 1, 2))
        .then(() => expect(result).to.be.equal(3));
    });
  });

  describe('sendAndReceive()', function() {
    it('should send a message to an actor and receive response', function() {
      return rootActor
        .createChild({
          howMany: (msg: number[]) => msg.length
        })
        .then(testActor => testActor.sendAndReceive('howMany', [1, 2, 3]))
        .then(result => {
          expect(result).to.be.equal(3);
        });
    });

    it('should support variable arguments', function() {
      return rootActor
        .createChild({
          sayHello: (to: string, from: string) => 'Hello to ' + to + ' from ' + from
        })
        .then(actor => actor.sendAndReceive('sayHello', 'Bob', 'Jack'))
        .then(result => expect(result).to.be.equal('Hello to Bob from Jack'));
    });
  });

  describe('createChild()', function() {
    it('should support TypeScript class behaviour definitions', function() {
      class TestActor {
        private name: string;
        
        initialize(selfActor: Actor) {
          this.name = 'TestActor ' + selfActor.getId();
        }

        sayHello() {
          return 'Hello from ' + this.name;
        }
      }

      return rootActor
        .createChild(TestActor)
        .then(testActor => testActor.sendAndReceive('sayHello')
          .then(result => expect(result).to.be.equal('Hello from TestActor ' + testActor.getId())));
    });

    it('should be able to load an actor from a given JavaScript module', function() {
      return rootActor
        .createChild('/test-resources/actors/test-actor')
        .then(actor => {
          expect(actor.getName()).to.be.equal('TestActor');

          return actor.sendAndReceive('hello', 123)
            .then(response => {
              expect(response).to.be.equal('Hello 123!');
            });
        });
    });

    it('should be able to load an actor from a given TypeScript module', function() {
      return rootActor
        .createChild('/test-resources/actors/test-typescript-actor')
        .then(actor => {
          expect(actor.getName()).to.be.equal('TestActor');

          return actor.sendAndReceive('hello', '123')
            .then(response => {
              expect(response).to.be.equal('Hello 123!');
            });
        });
    });
  });

  describe('createChildren()', function() {
    it('should create module actor children from a specified directory', async function() {
      const childActors = await rootActor.createChildren('/test-resources/actors/child-actors');

      expect(childActors.length).to.be.equal(2);

      const childActorNames = _.map(childActors, actor => actor.getName());

      expect(childActorNames).to.have.members(['ChildActor1', 'ChildActor2']);

      const childActorReplies = await P.map(childActors, actor => actor.sendAndReceive('hello'));

      expect(childActorReplies).to.have.members(['Hello from ChildActor1', 'Hello from ChildActor2']);
    });

    it('should be able to pass custom parameters to child actor', async function() {
      class MyActor {
        private helloResponse: string;
        
        initialize(selfActor: Actor) {
          const customParameters: any = selfActor.getCustomParameters();
          this.helloResponse = customParameters.helloResponse;
        }

        hello() {
          return this.helloResponse;
        }
      }

      // Create child actor with custom parameter.
      const childActor = await rootActor.createChild(MyActor, { customParameters: { helloResponse: 'Hi there!' } });

      const response = await childActor.sendAndReceive('hello');

      expect(response).to.be.equal('Hi there!');
    });
  });

  describe('forwardToParent()', function() {
    it('should forward messages with given topics to parent actor', async function() {
      let result = 0;

      const parentActor = await rootActor.createChild({
        initialize: async function(selfActor: Actor) {
          this.child = await selfActor.createChild({
            initialize: selfActor => selfActor.forwardToParent('plus', 'times')
          });
        },

        plus: (n: number) => result += n,

        times: (n: number) => result *= n,

        sendToChild: function(op: string, val: number) {
          return this.child.sendAndReceive(op, val);
        }
      });

      await parentActor.sendAndReceive('sendToChild', 'plus', 2);
      await parentActor.sendAndReceive('sendToChild', 'times', 3);

      expect(result).to.be.equal(6);
    });

    it('should support regular expressions', async function() {
      let result = 0;

      const parentActor = await rootActor.createChild({
        initialize: async function(selfActor: Actor) {
          this.child = await selfActor.createChild({
            initialize: selfActor => selfActor.forwardToParent(/^math/)
          });
        },

        mathPlus: (n: number) => result += n,

        mathTimes: (n: number) => result *= n,

        sendToChild: function(op: string, val: number) {
          return this.child.sendAndReceive(op, val);
        }
      });

      await parentActor.sendAndReceive('sendToChild', 'mathPlus', 2);
      await parentActor.sendAndReceive('sendToChild', 'mathTimes', 3);

      expect(result).to.be.equal(6);
    });
  });

  describe('forwardToChild()', function() {
    it('should forward messages with given topics to a given child actor', async function() {
      let child2Mailbox: string[] = [];
      const parent = await rootActor.createChild({
        initialize: selfActor => {
          // Create first child that receives 'hello' messages and sends 'tell...' messages to parent.
          const child1Promise = selfActor
            .createChild({
              initialize: selfActor => {
                this.parent = selfActor.getParent();
              },

              hello: (msg: string) => {
                return this.parent.sendAndReceive('tellChild2', msg);
              }
            })
            .then(child1 => {
              // Forward 'hello' messages to this child.
              return selfActor.forwardToChild(child1, 'hello');
            });

          // Create second child that receives 'tell...' messages and writes to mailbox.
          const child2Promise = selfActor
            .createChild({
              tellChild2: (msg: string) => {
                child2Mailbox.push(msg);
              }
            })
            .then(child2 => {
              // Forward 'hello...' messages to this child.
              return selfActor.forwardToChild(child2, /^tell.*/);
            });

          return P.join(child1Promise, child2Promise);
        }
      });

      await parent.sendAndReceive('hello', 'World!');

      expect(child2Mailbox).to.have.members(['World!']);
    });
  });

  describe('metrics()', function() {
    it('should collect metrics from target actor and all the actor sub-tree', async function() {
      let parent = await rootActor.createChild({
        initialize: function(selfActor) {
          return P.join(
            selfActor.createChild({
              metrics: function() {
                return {
                  childMetric: 222
                };
              }
            }, { name: 'Child1', mode: 'in-memory' }),
            selfActor.createChild({
              metrics: function() {
                return {
                  childMetric: 333
                };
              }
            }, { name: 'Child2', mode: 'in-memory' })
          );
        },

        metrics: function() {
          return {
            parentMetric: 111
          };
        }
      });

      let metrics = await parent.metrics();

      expect(metrics).to.be.deep.equal({
        parentMetric: 111,
        Child1: {
          childMetric: 222
        },
        Child2: {
          childMetric: 333
        }
      });
    });
  });

  describe('destroy()', function() {
    it('should call destroy() method in behaviour object', async function() {
      let destroyed = false;
      const childActor = await rootActor.createChild({
        destroy: () => destroyed = true
      });

      await childActor.destroy();

      expect(destroyed).to.be.equal(true);
    });

    it('should destroy children before destroying self', async function() {
      let destroyList: string[] = [];
      await rootActor.createChild({
        initialize: function(selfActor: Actor) {
          return selfActor.createChild({
            destroy: () => destroyList.push('grandchild')
          });
        },

        destroy: () => destroyList.push('child')
      });

      await rootActor.destroy();

      expect(destroyList).to.be.deep.equal(['grandchild', 'child']);
    });

    it('should softly destroy an actor allowing it to drain it\'s mailbox (send)', async function() {
      let finishedTasks: string[] = [];
      const childActor = await rootActor.createChild({
        test: (msg: string) => {
          return P.delay(1000).then(() => {
            finishedTasks.push(msg);
          });
        }
      });

      _.times(3, i => {
        childActor.send('test', `Message ${i + 1}`);
      });

      await childActor.destroy();

      expect(finishedTasks).to.have.members(['Message 1', 'Message 2', 'Message 3']);
    });

    it('should softly destroy an actor allowing it to drain it\'s mailbox (sendAndReceive)', async function() {
      let finishedTasks: string[] = [];
      const childActor = await rootActor.createChild({
        test: (msg: string) => {
          return P.delay(1000).then(() => {
            finishedTasks.push(msg);
          });
        }
      });

      _.times(3, i => {
        childActor.sendAndReceive('test', `Message ${i + 1}`);
      });

      await childActor.destroy();

      expect(finishedTasks).to.have.members(['Message 1', 'Message 2', 'Message 3']);
    });
  });
});