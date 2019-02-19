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
import * as http from 'http';
import * as net from 'net';
import * as request from 'supertest';
import {IncomingMessage, Server as HttpServer, ServerResponse} from 'http';
import {Server as NetServer, Socket} from 'net';

let system: ActorSystem;
let rootActor: Actor;

describe('ForkedActor', function() {
  beforeEach(async function() {
    system = actors.createSystem({
      test: true,
      additionalRequires: 'ts-node/register'
    });

    rootActor = await system.rootActor();
  });

  afterEach(async function() {
    return await system.destroy();
  });

  describe('sendAndReceive()', function() {
    it('should throw error if handler threw error', async () => {
      try {
        let testActor = await rootActor
          .createChild({
            myMessage: () => {
              throw new Error('Sorry!');
            }
          }, { mode: 'forked' });
          await testActor.sendAndReceive('myMessage', 'Hi!');
      } catch (err) {
        expect(err.message).to.be.equal('Sorry!');
      }
      return true;
    });

    it('should fork a sub-process and perform message exchange', async () => {
      let behaviour = {
        getPid: () => {
          return process.pid;
        }
      };

      let forkedChild = await rootActor.createChild(behaviour, { mode: 'forked' });
      let forkedPid = await forkedChild.sendAndReceive('getPid');

      expect(forkedPid).to.be.a('number');
      expect(forkedPid).to.be.not.equal(process.pid);

      // Check that child process is running.
      expect(isRunning(forkedPid)).to.be.equal(true);

      // Destroy forked actor.
      await forkedChild.destroy();

      // From this point, any additional communication should not be possible.
      let expectedErr = await forkedChild.sendAndReceive('getPid').catch((err: Error) => err);

      expect(expectedErr).to.be.instanceof(Error);

      // The process should be stopped eventually.
      await tu.waitForCondition(() => !isRunning(forkedPid));
    });

    it('should be able to import modules in forked process', async () => {
      // Use module import in behaviour.
      let behaviour = {
        sayHello: () => {
          let P = require('bluebird');

          return P.resolve('Hello!');
        }
      };

      let forkedChild = await rootActor.createChild(behaviour, { mode: 'forked' });
      let result = await forkedChild.sendAndReceive('sayHello');

      expect(result).to.be.equal('Hello!');
    });

    it('should be able to send a message to parent actor', async function () {
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
          initialize: function(selfActor: Actor) {
            return selfActor.createChild(childBehaviour, { mode: 'forked' }).then(child => {
              this.child = child;
            });
          },

          reply: function(msg: any) {
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

    it('should be able to forward messages to parent', async function () {
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
          initialize: function(selfActor: Actor) {
            return selfActor.createChild(childBehaviour, { mode: 'forked' }).then(child => {
              this.child = child;
            });
          },

          reply: function(msg: any) {
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

    it('should support custom object marshallers in object form', async function () {
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

      system = actors.createSystem({
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
        { mode: 'forked' });

      let result = await child.sendAndReceive('sayHello', new TestMessageClass(process.pid));

      expect(result).to.be.equal('Hello ' + process.pid);
    });

    it('should support custom object marshallers in class form', async function () {
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
        { mode: 'forked' });

      let result = await child.sendAndReceive('sayHello', new TestMessageClass(process.pid));

      expect(result).to.be.equal('Hello ' + process.pid);
    });

    it('should support custom module-based object marshallers in class form', async function () {
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
        { mode: 'forked' });

      let result = await child.sendAndReceive('sayHello', new TestMessageClass(process.pid));

      expect(result).to.be.equal('Hello ' + process.pid);
    });

    it('should support variable arguments', async function () {
      let child = await rootActor.createChild({
        hello: (from: string, to: string) => `Hello from ${from} to ${to}.`
      }, { mode: 'forked' });

      let result = await child.sendAndReceive('hello', 'Bob', 'Alice');

      expect(result).to.be.equal('Hello from Bob to Alice.');
    });

    it('should be able to marshall each variable argument with a custom marshaller', async function () {
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
          sayHello: (msg: TestMessageClass, from: string) => `Hello ${msg.getPid()} from ${from}`
        },
        { mode: 'forked' });

      let result = await child.sendAndReceive('sayHello', new TestMessageClass(process.pid), 'Test');

      expect(result).to.be.equal(`Hello ${process.pid} from Test`);
    });

    it('should support http.Server object transfer', async function () {
      let server: HttpServer = http.createServer();

      server.listen(8888);

      let child = await rootActor.createChild({
        setServer: function(server: HttpServer) {
          // Handle HTTP requests.
          server.on('request', (req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Hello!');
          });

          this.server = server;
        },

        destroy: function() {
          return require('bluebird').fromCallback((cb: any) => {
            this.server.close(cb);
          });
        }
      }, { mode: 'forked' });

      await child.sendAndReceive('setServer', server);

      // Close server in this process to avoid receiving connections locally.
      await P.fromCallback(cb => {
        server.close(cb);
      });

      await request('http://127.0.0.1:8888')
        .get('/')
        .expect(200)
        .then(res => {
          expect(res.text).to.be.equal('Hello!');
        });
    });

    it('should support net.Server object transfer', async function () {
      let server: NetServer = net.createServer();

      await P.fromCallback(cb => {
        server.listen(8889, '127.0.0.1', cb);
      });

      let child = await rootActor.createChild({
        setServer: function(server: NetServer) {
          // Send hello message on connection.
          server.on('connection', socket => {
            socket.end('Hello!');
          });

          this.server = server;
        },

        destroy: function() {
          return require('bluebird').fromCallback((cb: any) => {
            this.server.close(cb);
          });
        }
      }, { mode: 'forked' });

      await child.sendAndReceive('setServer', server);

      // Close server in this process to avoid receiving connections locally.
      await P.fromCallback(cb => {
        server.close(cb);
      });

      let serverMessage = await P.fromCallback(cb => {
        let clientSocket = new net.Socket();

        clientSocket.setEncoding('UTF8');

        clientSocket.on('data', data => {
          cb(null, data);
        });

        clientSocket.connect(8889, '127.0.0.1', (err: Error) => {
          if (err) return cb(err);
        });
      });

      expect(serverMessage).to.be.equal('Hello!');
    });

    it('should be able to pass actor references', async function () {
      let rootActor = await system.rootActor();
      let localCounter = 0;
      let localChild = await rootActor.createChild({
        tell: (msg: string) => {
          localCounter++;

          return msg.toUpperCase();
        }
      });
      let forkedChild = await rootActor.createChild({
        setLocal: function(actor: ActorRef) {
          this.localActor = actor;
        },

        tellLocal: function(msg: string) {
          return this.localActor.sendAndReceive('tell', msg);
        }
      }, { mode: 'forked' });

      await forkedChild.sendAndReceive('setLocal', localChild);

      let result = await forkedChild.sendAndReceive('tellLocal', 'Hello!');

      expect(result).to.be.equal('HELLO!');
      expect(localCounter).to.be.equal(1);
    });
  });

  describe('send()', function() {
    it('should support variable arguments', async function () {
      let replyDfd = P.defer();
      let childBehaviour = {
        initialize: function(selfActor: Actor) {
          this.parent = selfActor.getParent();
        },

        hello: function(from: string, to: string) {
          this.parent.send('helloReply', to, from);
        }
      };
      let parent = await rootActor.createChild({
        initialize: function(selfActor: Actor) {
          return selfActor.createChild(childBehaviour, { mode: 'forked' }).then(child => {
            this.child = child;
          });
        },

        helloReply: function(from: string, to: string) {
          replyDfd.resolve(`Hello reply from ${from} to ${to}.`);
        },

        helloToChild: function() {
          return this.child.send('hello', 'Bob', 'Alice');
        }
      }, { mode: 'in-memory' });

      await parent.send('helloToChild');

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
        .createChild(TestActor, { mode: 'forked' })
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
        .createChild(TestActor, { mode: 'forked' })
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
        .createChild(TestActor, { mode: 'forked' })
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
        .createChild(TestActor, { mode: 'forked' })
        .then(testActor => testActor.sendAndReceive('sayHello'))
        .then(result => expect(result).to.be.equal('Hello from TestActor'));
    });

    it('should support crashed actor respawn', async function () {
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
        initialize: function(selfActor: Actor) {
          return selfActor.createChild(childBehaviour, { mode: 'forked', onCrash: 'respawn' }).then(child => {
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

      for (let i = 0; i < 2; i++) {
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
        .createChild('/test-resources/actors/test-actor', { mode: 'forked' })
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
        .createChild('/test-resources/actors/test-typescript-actor', { mode: 'forked' })
        .then(actor => {
          expect(actor.getName()).to.be.equal('TestActor');

          return actor.sendAndReceive('hello', '123')
            .then(response => {
              expect(response).to.be.equal('Hello 123!');
            });
        });
    });

    it('should be able to pass custom parameters to child actor', async function () {
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
        mode: 'forked',
        customParameters: { helloResponse: 'Hi there!' }
      });

      let response = await childActor.sendAndReceive('hello');

      expect(response).to.be.equal('Hi there!');
    });

    it('should be able to pass actor references through custom parameters', async function () {
      let rootActor = await system.rootActor();
      let localCounter = 0;
      let localChild = await rootActor.createChild({
        tell: (msg: string) => {
          localCounter++;

          return msg.toUpperCase();
        }
      });
      let forkedChild = await rootActor.createChild({
        initialize: function(selfActor: Actor) {
          this.localActor = selfActor.getCustomParameters().localActor;
        },

        tellLocal: function(msg: string) {
          return this.localActor.sendAndReceive('tell', msg);
        }
      }, {
        mode: 'forked',
        customParameters: {
          localActor: localChild
        }
      });

      let result = await forkedChild.sendAndReceive('tellLocal', 'Hello!');

      expect(result).to.be.equal('HELLO!');
      expect(localCounter).to.be.equal(1);
    });

    it('should be able to pass http.Server object as custom parameter to child actor', async function () {
      let server: HttpServer = http.createServer();

      server.listen(8888);

      await rootActor.createChild({
        initialize: function(selfActor) {
          this.server = selfActor.getCustomParameters().server;

          // Handle HTTP requests.
          this.server.on('request', (req: IncomingMessage, res: ServerResponse) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Hello!');
          });
        },

        destroy: function() {
          return require('bluebird').fromCallback((cb: any) => {
            this.server.close(cb);
          });
        }
      }, { mode: 'forked', customParameters: { server: server } });

      // Close server in this process to avoid receiving connections locally.
      await P.fromCallback(cb => {
        server.close(cb);
      });

      await request('http://127.0.0.1:8888')
        .get('/')
        .expect(200)
        .then(res => {
          expect(res.text).to.be.equal('Hello!');
        });
    });

    it('should be able to pass net.Server object as custom parameter to child actor', async function () {
      let server: NetServer = net.createServer();

      await P.fromCallback(cb => {
        server.listen(8889, '127.0.0.1', cb);
      });

      await rootActor.createChild({
        initialize: function(selfActor) {
          this.server = selfActor.getCustomParameters().server;

          // Send hello message on connection.
          this.server.on('connection', (socket: Socket) => {
            socket.end('Hello!');
          });
        },

        destroy: function() {
          return require('bluebird').fromCallback((cb: any) => {
            this.server.close(cb);
          });
        }
      }, { mode: 'forked', customParameters: { server: server } });

      // Close server in this process to avoid receiving connections locally.
      await P.fromCallback(cb => {
        server.close(cb);
      });

      let serverMessage = await P.fromCallback(cb => {
        let clientSocket = new net.Socket();

        clientSocket.setEncoding('UTF8');

        clientSocket.on('data', data => {
          cb(null, data);
        });

        clientSocket.connect(8889, '127.0.0.1', (err: Error) => {
          if (err) return cb(err);
        });
      });

      expect(serverMessage).to.be.equal('Hello!');
    });
  });

  describe('createChildren()', function() {
    it('should create module actor children from a specified directory', async function () {
      let childActors = await rootActor.createChildren('/test-resources/actors/child-actors', { mode: 'forked' });

      expect(childActors.length).to.be.equal(2);

      let childActorNames = _.map(childActors, (actor: ActorRef) => actor.getName());

      expect(childActorNames).to.have.members(['ChildActor1', 'ChildActor2']);

      let childActorReplies = await P.map(childActors, (actor: ActorRef) => actor.sendAndReceive('hello'));

      expect(childActorReplies).to.have.members(['Hello from ChildActor1', 'Hello from ChildActor2']);
    });
  });

  describe('forwardToChild()', function() {
    it('should forward messages with given topics to a given child actor', async function () {
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
            }, { mode: 'forked' })
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
            }, { mode: 'forked' })
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
    it('should collect metrics from target actor and all the actor sub-tree', async function () {
      let parent = await rootActor.createChild({
        initialize: function(selfActor) {
          return P.all([
            selfActor.createChild({
              metrics: function() {
                return {
                  childMetric: 222
                };
              }
            }, { name: 'Child1', mode: 'forked' }),
            selfActor.createChild({
              metrics: function() {
                return {
                  childMetric: 333
                };
              }
            }, { name: 'Child2', mode: 'forked' })
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

    it('should collect metrics from forked actor', async function () {
      let forked = await rootActor.createChild({
        metrics: function() {
          return {
            metric: 111
          };
        }
      }, { name: 'Child', mode: 'forked' });

      let metrics = await forked.metrics();

      expect(metrics).to.be.deep.equal({
        metric: 111
      });
    });

    it('should not collect metrics from destroyed actors', async function () {
      let parent = await rootActor.createChild({
        initialize: async function(selfActor) {
          this.child1 = await selfActor.createChild({
            metrics: function() {
              return {
                childMetric: 222
              };
            }
          }, { name: 'Child1', mode: 'forked' });
          this.child2 = await selfActor.createChild({
            metrics: function() {
              return {
                childMetric: 333
              };
            }
          }, { name: 'Child2', mode: 'forked' });
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

  describe('destroy()', function() {
    it('should softly destroy an actor allowing it to drain it\'s mailbox (send)', async function () {
      class ChildActor {
        private parent: ParentActorRef;
        initialize(selfActor: Actor) {
          this.parent = selfActor.getParent();
        }

        async test(msg: string) {
          await this.parent.sendAndReceive('handling', msg);
          await require('bluebird').delay(1000);
          await this.parent.sendAndReceive('handled', msg);
        }
      }

      class ParentActor {
        private handlingCount: number;
        private handledMessages: any[];
        private handlingDfd: any;
        private child: ActorRef;

        constructor() {
          this.handlingCount = 0;
          this.handledMessages = [];
          this.handlingDfd = P.defer();
        }

        async initialize(selfActor: Actor) {
          this.child = await selfActor.createChild(ChildActor, { mode: 'forked' });
        }

        handling() {
          this.handlingCount++;

          if (this.handlingCount == 3) {
            this.handlingDfd.resolve();
          }
        }

        handled(msg: string) {
          this.handledMessages.push(msg);
        }

        getHandled() {
          return this.handledMessages;
        }

        async test() {
          _.times(3, i => {
            this.child.send('test', `Message ${i + 1}`);
          });

          await this.handlingDfd.promise; // Wait for message handling to start.

          await this.child.destroy();
        }
      }

      let parentActor = await rootActor.createChild(ParentActor, { mode: 'in-memory' });

      await parentActor.sendAndReceive('test');

      let handledMessages = await parentActor.sendAndReceive('getHandled');

      expect(handledMessages).to.have.members(['Message 1', 'Message 2', 'Message 3']);
    });
  });
});
