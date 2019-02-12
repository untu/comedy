/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

import {ActorSystem, Actor, ActorRef} from '../../index';
import {afterEach} from 'mocha';
import * as tu from '../../lib/utils/test';
import * as actors from '../../index';
import {expect} from 'chai';
import * as isRunning from 'is-running';
import * as P from 'bluebird';
import * as _ from 'underscore';

let system: ActorSystem;
let rootActor: Actor;
let remoteSystem: ActorSystem;
let systemConfig = {
  test: true,
  additionalRequires: 'ts-node/register',
  pingTimeout: 2000
};

describe('RemoteActor', function() {
  beforeEach(async () => {
    system = actors.createSystem(systemConfig);
    remoteSystem = actors.createSystem(systemConfig);

    rootActor = await system.rootActor();
    return remoteSystem.listen();

  });

  afterEach(function() {
    return P.all([system.destroy(), remoteSystem.destroy()]);
  });

  describe('sendAndReceive', function() {
    it('should perform message exchange with remote actor', async () => {
      let behaviour = {
        sayHello: (to: string) => {
          return `Hello, ${to}!`;
        }
      };

      let remoteChild = await rootActor.createChild(behaviour, { mode: 'remote', host: '127.0.0.1' });
      let response = await remoteChild.sendAndReceive('sayHello', 'Bob');

      expect(response).to.be.equal('Hello, Bob!');

      // Destroy remote actor.
      await remoteChild.destroy();

      // From this point, any additional communication should not be possible.
      let expectedErr = await remoteChild.sendAndReceive('sayHello', 'Jack').catch(err => err);

      expect(expectedErr).to.be.instanceof(Error);
    });

    it('should correctly fail if wrong port is specified', async () => {
      let expectedErr = await rootActor
        .createChild({}, { mode: 'remote', host: '127.0.0.1', port: 6262 })
        .catch(err => err);

      expect(expectedErr).to.be.instanceof(Error);
    });

    it('should throw error if listener node is down', async () => {
      await remoteSystem.destroy();

      let rootActor = await system.rootActor();
      let error;

      try {
        await rootActor.createChild({
          getPid: () => process.pid
        }, { mode: 'remote', host: '127.0.0.1' });
      }
      catch (err) {
        error = err;
      }

      expect(error).to.be.an.instanceof(Error);
    });

    it('should throw error if handler threw error', function(done) {
      rootActor
        .createChild({
          myMessage: () => {
            throw new Error('Sorry!');
          }
        }, { mode: 'remote', host: '127.0.0.1' })
        .then(testActor => testActor.sendAndReceive('myMessage', 'Hi!'))
        .then(() => {
          done('Expected error!');
        })
        .catch(err => {
          expect(err.message).to.be.equal('Sorry!');
        })
        .then(done)
        .catch(done);
    });

    it('should correctly manage remote actor process', async () => {
      let behaviour = {
        getPid: () => {
          return process.pid;
        }
      };

      let remoteChild = await rootActor.createChild(behaviour, { mode: 'remote', host: '127.0.0.1' });
      let remotePid = await remoteChild.sendAndReceive('getPid');

      expect(remotePid).to.be.a('number');
      expect(remotePid).to.be.not.equal(process.pid);

      // Check that remote process is running.
      expect(isRunning(remotePid)).to.be.equal(true);

      // Destroy remote actor.
      await remoteChild.destroy();

      // From this point, any additional communication should not be possible.
      let expectedErr = await remoteChild.sendAndReceive('getPid').catch(err => err);

      expect(expectedErr).to.be.instanceof(Error);

      // The process should be stopped eventually.
      await tu.waitForCondition(() => !isRunning(remotePid));
    });

    it('should be able to import modules in remote process', async () => {
      // Use module import in behaviour.
      let behaviour = {
        sayHello: () => {
          let P = require('bluebird');

          return P.resolve('Hello!');
        }
      };

      let remoteChild = await rootActor.createChild(behaviour, { mode: 'remote', host: '127.0.0.1' });
      let result = await remoteChild.sendAndReceive('sayHello');

      expect(result).to.be.equal('Hello!');
    });

    it('should be able to send a message to parent actor', async () => {
      let replyMsg = await new P((resolve, reject) => {
        let childBehaviour = {
          initialize: function(selfActor: Actor) {
            this.parent = selfActor.getParent();
          },

          sayHello: function() {
            return this.parent.sendAndReceive('reply', 'Hi!');
          }
        };
        let parentBehaviour = {
          initialize: async function(selfActor: Actor) {
            this.child = await selfActor.createChild(childBehaviour, { mode: 'remote', host: '127.0.0.1' });
          },

          reply: function(msg: string) {
            resolve(msg);
          },

          sayHelloToChild: function() {
            return this.child.sendAndReceive('sayHello');
          }
        };

        rootActor.createChild(parentBehaviour)
          .then(parent => parent.sendAndReceive('sayHelloToChild'))
          .catch(reject);
      });

      expect(replyMsg).to.be.equal('Hi!');
    });

    it('should be able to forward messages to parent', async () => {
      let replyMsg = await new P((resolve, reject) => {
        let childBehaviour = {
          initialize: function(selfActor: Actor) {
            selfActor.forwardToParent('reply');

            return selfActor
              .createChild({
                initialize: function(selfActor: Actor) {
                  this.parent = selfActor.getParent();
                },

                sayHello: function() {
                  return this.parent.sendAndReceive('reply', 'Hi!');
                }
              })
              .then(child => this.child = child);
          },

          sayHello: function() {
            return this.child.sendAndReceive('sayHello');
          }
        };
        let parentBehaviour = {
          initialize: async function(selfActor: Actor) {
            this.child = await selfActor.createChild(childBehaviour, { mode: 'remote', host: '127.0.0.1' });
          },

          reply: function(msg: string) {
            resolve(msg);
          },

          sayHelloToChild: function() {
            return this.child.sendAndReceive('sayHello');
          }
        };

        rootActor.createChild(parentBehaviour)
          .then(parent => parent.sendAndReceive('sayHelloToChild'))
          .catch(reject);
      });

      expect(replyMsg).to.be.equal('Hi!');
    });

    it('should support custom object marshallers in object form', async () => {
      class TestMessageClass {
        private readonly pid: number;
        constructor(pid: number) {
          this.pid = pid;
        }

        getPid() {
          return this.pid;
        }
      }

      await system.destroy();

      system = actors. createSystem({
        test: true,
        marshallers: [
          {
            type: TestMessageClass,
            marshall: function(msg: any) {
              return { pid: msg.pid };
            },
            unmarshall: function(msg: any) {
              return {
                getPid: () => msg.pid
              };
            }
          }
        ]
      });

      let rootActor = await system.rootActor();
      let child = await rootActor.createChild(
        {
          sayHello: (msg: any) => 'Hello ' + msg.getPid()
        },
        { mode: 'remote', host: '127.0.0.1' });

      let result = await child.sendAndReceive('sayHello', new TestMessageClass(process.pid));

      expect(result).to.be.equal('Hello ' + process.pid);
    });

    it('should support custom object marshallers in class form', async () => {
      class TestMessageClass {
        private readonly pid: number;
        static typeName() {
          return 'TestMessageClass';
        }

        constructor(pid: number) {
          this.pid = pid;
        }

        getPid() {
          return this.pid;
        }
      }
      class TestMessageClassMarshaller {
        getType() {
          return 'TestMessageClass';
        }

        marshall(msg: any) {
          return { pid: msg.pid };
        }

        unmarshall(msg: any) {
          return {
            getPid: () => msg.pid
          };
        }
      }

      await system.destroy();

      system = actors.createSystem({
        test: true,
        marshallers: [TestMessageClassMarshaller]
      });

      let rootActor = await system.rootActor();
      let child = await rootActor.createChild(
        {
          sayHello: (msg: any) => 'Hello ' + msg.getPid()
        },
        { mode: 'remote', host: '127.0.0.1' });

      let result = await child.sendAndReceive('sayHello', new TestMessageClass(process.pid));

      expect(result).to.be.equal('Hello ' + process.pid);
    });

    it('should support custom module-based object marshallers in class form', async () => {
      class TestMessageClass {
        private readonly pid: number;
        static typeName() {
          return 'TestMessageClass';
        }

        constructor(pid: number) {
          this.pid = pid;
        }

        getPid() {
          return this.pid;
        }
      }

      await system.destroy();

      system = actors.createSystem({
        test: true,
        marshallers: ['/test-resources/actors/test-message-class-marshaller']
      });

      let rootActor = await system.rootActor();
      let child = await rootActor.createChild(
        {
          sayHello: (msg: any) => 'Hello ' + msg.getPid()
        },
        { mode: 'remote', host: '127.0.0.1' });

      let result = await child.sendAndReceive('sayHello', new TestMessageClass(process.pid));

      expect(result).to.be.equal('Hello ' + process.pid);
    });

    it('should support variable arguments', async () => {
      let child = await rootActor.createChild({
        hello: (from: string, to: string) => `Hello from ${from} to ${to}.`
      }, { mode: 'remote', host: '127.0.0.1' });

      let result = await child.sendAndReceive('hello', 'Bob', 'Alice');

      expect(result).to.be.equal('Hello from Bob to Alice.');
    });

    it('should be able to marshall each variable argument with a custom marshaller', async () => {
      class TestMessageClass {
        private readonly pid: any;
        static typeName() {
          return 'TestMessageClass';
        }

        constructor(pid: number) {
          this.pid = pid;
        }

        getPid() {
          return this.pid;
        }
      }

      await system.destroy();

      system = actors.createSystem({
        test: true,
        marshallers: ['/test-resources/actors/test-message-class-marshaller']
      });

      let rootActor = await system.rootActor();
      let child = await rootActor.createChild(
        {
          sayHello: (msg: any, from: string) => `Hello ${msg.getPid()} from ${from}`
        },
        { mode: 'remote', host: '127.0.0.1' });

      let result = await child.sendAndReceive('sayHello', new TestMessageClass(process.pid), 'Test');

      expect(result).to.be.equal(`Hello ${process.pid} from Test`);
    });

    it('should be able to pass actor references', async () => {
      let rootActor = await system.rootActor();
      let localCounter = 0;
      let localChild = await rootActor.createChild({
        tell: (msg: string) => {
          localCounter++;

          return msg.toUpperCase();
        }
      });
      let remoteChild = await rootActor.createChild({
        setLocal: function(actor: ActorRef) {
          this.localActor = actor;
        },

        tellLocal: function(msg: any) {
          return this.localActor.sendAndReceive('tell', msg);
        }
      }, { mode: 'remote', host: '127.0.0.1' });

      await remoteChild.sendAndReceive('setLocal', localChild);

      let result = await remoteChild.sendAndReceive('tellLocal', 'Hello!');

      expect(result).to.be.equal('HELLO!');
      expect(localCounter).to.be.equal(1);
    });
  });

  describe('send()', async () => {
    it('should support variable arguments', async () => {
      let replyDfd = P.defer();
      let parent = await rootActor.createChild({
        initialize: async function(selfActor) {
          this.child = await selfActor.createChild({
            initialize: function(selfActor) {
              this.parent = selfActor.getParent();
            },

            hello: function(from: string, to: string) {
              this.parent.send('helloReply', to, from);
            }
          }, { mode: 'remote', host: '127.0.0.1' });
        },

        helloReply: function(from: string, to: string) {
          replyDfd.resolve(`Hello reply from ${from} to ${to}.`);
        },

        test: function() {
          return this.child.send('hello', 'Bob', 'Alice');
        }
      }, { mode: 'in-memory' });

      await parent.send('test');

      let result = await replyDfd.promise;

      expect(result).to.be.equal('Hello reply from Alice to Bob.');
    });
  });

  describe('createChild()', function() {
    it('should support ES6 class behaviour definitions', function() {
      class TestBase {
        protected name: string;
        sayHello() {
          return 'Hello from ' + this.name;
        }
      }

      class TestActor extends TestBase {
        initialize() {
          this.name = 'TestActor';
        }
      }

      return rootActor
        .createChild(TestActor, { mode: 'remote', host: '127.0.0.1' })
        .then(testActor => testActor.sendAndReceive('sayHello'))
        .then(result => expect(result).to.be.equal('Hello from TestActor'));
    });

    it('should support ES5 class behaviour definitions', function() {
      let TestActor = function() {
      };

      TestActor.prototype.initialize = function() {
        this.name = 'TestActor';
      };
      TestActor.prototype.sayHello = function() {
        return 'Hello from ' + this.name;
      };

      return rootActor
        .createChild(TestActor, { mode: 'remote', host: '127.0.0.1' })
        .then(testActor => testActor.sendAndReceive('sayHello'))
        .then(result => expect(result).to.be.equal('Hello from TestActor'));
    });

    it('should support ES5 class behaviour definitions in named function form', function() {
      function TestActor() {
        this.name = 'TestActor';
      }

      TestActor.prototype.initialize = function() {
        this.name += ' initialized';
      };
      TestActor.prototype.sayHello = function() {
        return 'Hello from ' + this.name;
      };

      return rootActor
        .createChild(TestActor, { mode: 'remote', host: '127.0.0.1' })
        .then(testActor => testActor.sendAndReceive('sayHello'))
        .then(result => expect(result).to.be.equal('Hello from TestActor initialized'));
    });

    it('should support ES5 class behaviour definition with inheritance', function() {
      function TestBase() {
      }

      TestBase.prototype.sayHello = function() {
        return 'Hello from ' + this.name;
      };

      function TestActor() {
        TestBase.call(this);
      }

      actors.inherits(TestActor, TestBase);

      TestActor.prototype.initialize = function() {
        this.name = 'TestActor';
      };

      return rootActor
        .createChild(TestActor, { mode: 'remote', host: '127.0.0.1' })
        .then(testActor => testActor.sendAndReceive('sayHello'))
        .then(result => expect(result).to.be.equal('Hello from TestActor'));
    });

    it('should support crashed actor respawn', async () => {
      let dfd = P.defer();
      let childBehaviour = {
        initialize: (selfActor: Actor) => {
          process.nextTick(() => selfActor.getParent().send('forkedReady'));
        },

        kill: () => {
          process.exit(1);
        },

        ping: () => 'pong'
      };
      let parent = await rootActor.createChild({
        initialize: function(selfActor) {
          return selfActor.createChild(childBehaviour, { mode: 'remote', host: '127.0.0.1', onCrash: 'respawn' })
            .then(child => {
              this.child = child;
            });
        },

        forkedReady: function() {
          dfd.resolve();
        },

        killChild: function() {
          return this.child.send('kill');
        },

        pingChild: function() {
          return this.child.sendAndReceive('ping');
        }
      }, { mode: 'in-memory' });

      // Wait for forked actor to initialize first time.
      await dfd.promise;

      for (let i = 0; i < 3; i++) {
        // Create new promise.
        dfd = P.defer();

        // Kill forked actor.
        await parent.send('killChild');

        // Wait for forked actor to respawn.
        await dfd.promise;

        // Ping forked actor.
        let resp = await parent.sendAndReceive('pingChild');

        expect(resp).to.be.equal('pong');
      }
    });

    it('should be able to load an actor from a given module', function() {
      return rootActor
        .createChild('/test-resources/actors/test-actor', { mode: 'remote', host: '127.0.0.1' })
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
        .createChild('/test-resources/actors/test-typescript-actor', { mode: 'remote', host: '127.0.0.1' })
        .then(actor => {
          expect(actor.getName()).to.be.equal('TestActor');

          return actor.sendAndReceive('hello', '123')
            .then(response => {
              expect(response).to.be.equal('Hello 123!');
            });
        });
    });

    it('should be able to pass custom parameters to child actor', async () => {
      class MyActor {
        private helloResponse: string;
        initialize(selfActor: Actor) {
          this.helloResponse = selfActor.getCustomParameters().helloResponse;
        }

        hello() {
          return this.helloResponse;
        }
      }

      // Create child actor with custom parameter.
      let childActor = await rootActor.createChild(MyActor, {
        mode: 'remote',
        host: '127.0.0.1',
        customParameters: { helloResponse: 'Hi there!' }
      });

      let response = await childActor.sendAndReceive('hello');

      expect(response).to.be.equal('Hi there!');
    });

    it('should support static cluster configuration', async () => {
      await P.all([system.destroy(), remoteSystem.destroy()]);

      let systemConfig0 = _.extend({}, systemConfig, {
        clusters: {
          test: ['127.0.0.1']
        }
      });

      system = actors.createSystem(systemConfig0);
      remoteSystem = actors.createSystem(systemConfig); // Listening node uses regular configuration.

      let rootActor = await system.rootActor();

      await remoteSystem.listen();

      let child = await rootActor.createChild({
        getPid: () => process.pid
      }, { mode: 'remote', cluster: 'test' });

      let childPid = await child.sendAndReceive('getPid');

      expect(childPid).to.be.a('number');
      expect(childPid).to.be.not.equal(process.pid);
    });

    it('should support clusterSize parameter in static cluster configuration', async () => {
      await P.all([system.destroy(), remoteSystem.destroy()]);

      let systemConfig0 = _.extend({}, systemConfig, {
        clusters: {
          test: ['127.0.0.1:6161', '127.0.0.1:6162']
        }
      });

      system = actors.createSystem(systemConfig0);
      remoteSystem = actors.createSystem(systemConfig); // Listening node uses regular configuration.
      let remoteSystem2 = actors.createSystem(systemConfig);

      let rootActor = await system.rootActor();

      await remoteSystem.listen(6161);
      await remoteSystem2.listen(6162);

      try {
        let child = await rootActor.createChild({
          getPid: () => process.pid
        }, { mode: 'remote', cluster: 'test', clusterSize: 4 });

        let pidPromises = _.times(8, () => child.sendAndReceive('getPid'));
        let pids = await P.all(pidPromises);
        let uniquePids = _.uniq(pids);

        expect(uniquePids.length).to.be.equal(4);
      }
      finally {
        await remoteSystem2.destroy();
      }
    });

    it('should support multiple hosts in "host" parameter', async () => {
      let remoteSystem2 = actors.createSystem(systemConfig);

      let rootActor = await system.rootActor();

      await remoteSystem.listen(6161);
      await remoteSystem2.listen(6162);

      try {
        let child = await rootActor.createChild({
          getPid: () => process.pid
        }, {
          mode: 'remote',
          host: ['127.0.0.1:6161', '127.0.0.1:6162']
        });

        let pidPromises = _.times(4, () => child.sendAndReceive('getPid'));
        let pids = await P.all(pidPromises);
        let uniquePids = _.uniq(pids);

        expect(uniquePids.length).to.be.equal(2);
      }
      finally {
        await remoteSystem2.destroy();
      }
    });

    it('should be able to pass actor references through custom parameters', async () => {
      let rootActor = await system.rootActor();
      let localCounter = 0;
      let localChild = await rootActor.createChild({
        tell: (msg: string) => {
          localCounter++;

          return msg.toUpperCase();
        }
      });
      let remoteChild = await rootActor.createChild({
        initialize: function(selfActor: Actor) {
          this.localActor = selfActor.getCustomParameters().localActor;
        },

        tellLocal: function(msg: string) {
          return this.localActor.sendAndReceive('tell', msg);
        }
      }, {
        mode: 'remote',
        host: '127.0.0.1',
        customParameters: {
          localActor: localChild
        }
      });

      let result = await remoteChild.sendAndReceive('tellLocal', 'Hello!');

      expect(result).to.be.equal('HELLO!');
      expect(localCounter).to.be.equal(1);
    });
  });

  describe('createChildren()', function() {
    it('should create module actor children from a specified directory', async () => {
      let childActors = await rootActor.createChildren(
        '/test-resources/actors/child-actors',
        { mode: 'remote', host: '127.0.0.1' });

      expect(childActors.length).to.be.equal(2);

      let childActorNames = _.map(childActors, actor => actor.getName());

      expect(childActorNames).to.have.members(['ChildActor1', 'ChildActor2']);

      let childActorReplies = await P.map(childActors, actor => actor.sendAndReceive('hello'));

      expect(childActorReplies).to.have.members(['Hello from ChildActor1', 'Hello from ChildActor2']);
    });
  });

  describe('forwardToChild()', function() {
    it('should forward messages with given topics to a given child actor', async () => {
      let parent = await rootActor.createChild({
        initialize: selfActor => {
          // Create first child that receives 'hello' messages and sends 'tell...' messages to parent.
          let child1Promise = selfActor
            .createChild({
              initialize: function(selfActor) {
                this.parent = selfActor.getParent();
              },

              hello: function(msg: string) {
                return this.parent.sendAndReceive('tellChild2', msg);
              }
            }, { mode: 'remote', host: '127.0.0.1' })
            .then(child1 => {
              // Forward 'hello' messages to this child.
              return selfActor.forwardToChild(child1, 'hello');
            });

          // Create second child that receives 'tell...' messages and writes to mailbox.
          let child2Promise = selfActor
            .createChild({
              initialize: function() {
                this.mailbox = [];
              },

              tellChild2: function(msg: string) {
                this.mailbox.push(msg);
              },

              getMailbox: function() {
                return this.mailbox;
              }
            }, { mode: 'remote', host: '127.0.0.1' })
            .then(child2 => {
              // Forward 'tell...' and 'getMailbox' messages to this child.
              return selfActor.forwardToChild(child2, /^tell.*/, 'getMailbox');
            });

          return P.all([child1Promise, child2Promise]);
        }
      });

      await parent.sendAndReceive('hello', 'World!');

      let child2Mailbox = await parent.sendAndReceive('getMailbox');

      expect(child2Mailbox).to.have.members(['World!']);
    });
  });

  describe('metrics()', function() {
    it('should collect metrics from target actor and all the actor sub-tree', async () => {
      let parent = await rootActor.createChild({
        initialize: function(selfActor) {
          return P.all([
            selfActor.createChild({
              metrics: function() {
                return {
                  childMetric: 222
                };
              }
            }, { name: 'Child1', mode: 'remote', host: '127.0.0.1' }),
            selfActor.createChild({
              metrics: function() {
                return {
                  childMetric: 333
                };
              }
            }, { name: 'Child2', mode: 'remote', host: '127.0.0.1' })
          ]);
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

    it('should not collect metrics from destroyed actors', async () => {
      let parent = await rootActor.createChild({
        initialize: async function(selfActor) {
          this.child1 = await selfActor.createChild({
            metrics: function() {
              return {
                childMetric: 222
              };
            }
          }, { name: 'Child1', mode: 'remote', host: '127.0.0.1' });
          this.child2 = await selfActor.createChild({
            metrics: function() {
              return {
                childMetric: 333
              };
            }
          }, { name: 'Child2', mode: 'remote', host: '127.0.0.1' });
        },

        metrics: function() {
          return {
            parentMetric: 111
          };
        },

        killChild2: function() {
          return this.child2.destroy();
        }
      });

      await parent.sendAndReceive('killChild2');

      let metrics = await parent.metrics();

      expect(metrics).to.be.deep.equal({
        parentMetric: 111,
        Child1: {
          childMetric: 222
        }
      });
    });
  });
});
