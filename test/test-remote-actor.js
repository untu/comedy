/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/* eslint require-jsdoc: "off" */

var actors = require('../index');
var tu = require('../lib/utils/test.js');
var expect = require('chai').expect;
var fs = require('fs');
var P = require('bluebird');
var _ = require('underscore');

var system;
var rootActor;
var remoteSystem;

describe('RemoteActor', function() {
  beforeEach(function() {
    system = actors({
      test: true,
      additionalRequires: 'ts-node/register'
    });

    remoteSystem = actors({
      test: true,
      additionalRequires: 'ts-node/register'
    });

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;

      return remoteSystem.listen();
    });
  });

  afterEach(function() {
    return P.join(system.destroy(), remoteSystem.destroy());
  });

  describe('sendAndReceive', function() {
    it('should perform message exchange with remote actor', P.coroutine(function*() {
      var behaviour = {
        sayHello: (to) => {
          return `Hello, ${to}!`;
        }
      };

      var remoteChild = yield rootActor.createChild(behaviour, { mode: 'remote', host: '127.0.0.1' });
      var response = yield remoteChild.sendAndReceive('sayHello', 'Bob');

      expect(response).to.be.equal('Hello, Bob!');

      // Destroy remote actor.
      yield remoteChild.destroy();

      // From this point, any additional communication should not be possible.
      var expectedErr = yield remoteChild.sendAndReceive('sayHello', 'Jack').catch(err => err);

      expect(expectedErr).to.be.instanceof(Error);
    }));

    it('should correctly fail if wrong port is specified', P.coroutine(function*() {
      var expectedErr = yield rootActor
        .createChild({}, { mode: 'remote', host: '127.0.0.1', port: 6262 })
        .catch(err => err);

      expect(expectedErr).to.be.instanceof(Error);
    }));

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

    it('should correctly manage remote actor process', P.coroutine(function*() {
      var behaviour = {
        getPid: () => {
          return process.pid;
        }
      };

      var remoteChild = yield rootActor.createChild(behaviour, { mode: 'remote', host: '127.0.0.1' });
      var remotePid = yield remoteChild.sendAndReceive('getPid');

      expect(remotePid).to.be.a.number;
      expect(remotePid).to.be.not.equal(process.pid);

      // Check that remote process is running.
      var psExists = fs.existsSync('/proc/' + remotePid);

      expect(psExists).to.be.equal(true);

      // Destroy remote actor.
      yield remoteChild.destroy();

      // From this point, any additional communication should not be possible.
      var expectedErr = yield remoteChild.sendAndReceive('getPid').catch(err => err);

      expect(expectedErr).to.be.instanceof(Error);

      // The process should be stopped eventually.
      yield tu.waitForCondition(() => !fs.existsSync('/proc/' + remotePid));
    }));

    it('should be able to import modules in remote process', P.coroutine(function*() {
      // Use module import in behaviour.
      var behaviour = {
        sayHello: () => {
          var P = require('bluebird');

          return P.resolve('Hello!');
        }
      };

      var remoteChild = yield rootActor.createChild(behaviour, { mode: 'remote', host: '127.0.0.1' });
      var result = yield remoteChild.sendAndReceive('sayHello');

      expect(result).to.be.equal('Hello!');
    }));

    it('should be able to send a message to parent actor', P.coroutine(function*() {
      var replyMsg = yield new P((resolve, reject) => {
        var parentBehaviour = {
          reply: function(msg) {
            resolve(msg);
          }
        };
        var childBehaviour = {
          initialize: function(selfActor) {
            this.parent = selfActor.getParent();
          },

          sayHello: function() {
            return this.parent.sendAndReceive('reply', 'Hi!');
          }
        };

        rootActor.createChild(parentBehaviour)
          .then(parent => parent.createChild(childBehaviour, { mode: 'remote', host: '127.0.0.1' }))
          .then(child => child.sendAndReceive('sayHello'))
          .catch(reject);
      });

      expect(replyMsg).to.be.equal('Hi!');
    }));

    it('should be able to forward messages to parent', P.coroutine(function*() {
      var replyMsg = yield new P((resolve, reject) => {
        var parentBehaviour = {
          reply: function(msg) {
            resolve(msg);
          }
        };
        var childBehaviour = {
          initialize: function(selfActor) {
            selfActor.forwardToParent('reply');

            return selfActor
              .createChild({
                initialize: function(selfActor) {
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

        rootActor.createChild(parentBehaviour)
          .then(parent => parent.createChild(childBehaviour, { mode: 'remote', host: '127.0.0.1' }))
          .then(child => child.sendAndReceive('sayHello'))
          .catch(reject);
      });

      expect(replyMsg).to.be.equal('Hi!');
    }));

    it('should support custom object marshallers in object form', P.coroutine(function*() {
      class TestMessageClass {
        constructor(pid) {
          this.pid = pid;
        }

        getPid() {
          return this.pid;
        }
      }

      var testSystem = actors({
        test: true,
        marshallers: [
          {
            type: TestMessageClass,
            marshall: function(msg) {
              return { pid: msg.pid };
            },
            unmarshall: function(msg) {
              return {
                getPid: () => msg.pid
              };
            }
          }
        ]
      });

      var rootActor = yield testSystem.rootActor();
      var child = yield rootActor.createChild(
        {
          sayHello: (msg) => 'Hello ' + msg.getPid()
        },
        { mode: 'remote', host: '127.0.0.1' });

      var result = yield child.sendAndReceive('sayHello', new TestMessageClass(process.pid));

      expect(result).to.be.equal('Hello ' + process.pid);
    }));

    it('should support custom object marshallers in class form', P.coroutine(function*() {
      class TestMessageClass {
        static typeName() {
          return 'TestMessageClass';
        }

        constructor(pid) {
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

        marshall(msg) {
          return { pid: msg.pid };
        }

        unmarshall(msg) {
          return {
            getPid: () => msg.pid
          };
        }
      }

      var testSystem = actors({
        test: true,
        marshallers: [TestMessageClassMarshaller]
      });

      var rootActor = yield testSystem.rootActor();
      var child = yield rootActor.createChild(
        {
          sayHello: (msg) => 'Hello ' + msg.getPid()
        },
        { mode: 'remote', host: '127.0.0.1' });

      var result = yield child.sendAndReceive('sayHello', new TestMessageClass(process.pid));

      expect(result).to.be.equal('Hello ' + process.pid);
    }));

    it('should support custom module-based object marshallers in class form', P.coroutine(function*() {
      class TestMessageClass {
        static typeName() {
          return 'TestMessageClass';
        }

        constructor(pid) {
          this.pid = pid;
        }

        getPid() {
          return this.pid;
        }
      }

      var testSystem = actors({
        test: true,
        marshallers: ['/test-resources/actors/test-message-class-marshaller']
      });

      var rootActor = yield testSystem.rootActor();
      var child = yield rootActor.createChild(
        {
          sayHello: (msg) => 'Hello ' + msg.getPid()
        },
        { mode: 'remote', host: '127.0.0.1' });

      var result = yield child.sendAndReceive('sayHello', new TestMessageClass(process.pid));

      expect(result).to.be.equal('Hello ' + process.pid);
    }));

    it('should support variable arguments', P.coroutine(function*() {
      var child = yield rootActor.createChild({
        hello: (from, to) => `Hello from ${from} to ${to}.`
      }, { mode: 'remote', host: '127.0.0.1' });

      var result = yield child.sendAndReceive('hello', 'Bob', 'Alice');

      expect(result).to.be.equal('Hello from Bob to Alice.');
    }));

    it('should be able to marshall each variable argument with a custom marshaller', P.coroutine(function*() {
      class TestMessageClass {
        static typeName() {
          return 'TestMessageClass';
        }

        constructor(pid) {
          this.pid = pid;
        }

        getPid() {
          return this.pid;
        }
      }

      var testSystem = actors({
        test: true,
        marshallers: ['/test-resources/actors/test-message-class-marshaller']
      });

      var rootActor = yield testSystem.rootActor();
      var child = yield rootActor.createChild(
        {
          sayHello: (msg, from) => `Hello ${msg.getPid()} from ${from}`
        },
        { mode: 'remote', host: '127.0.0.1' });

      var result = yield child.sendAndReceive('sayHello', new TestMessageClass(process.pid), 'Test');

      expect(result).to.be.equal(`Hello ${process.pid} from Test`);
    }));
  });

  describe('send()', function() {
    it('should support variable arguments', P.coroutine(function*() {
      var replyDfd = P.pending();
      var parent = yield rootActor.createChild({
        helloReply: function(from, to) {
          replyDfd.resolve(`Hello reply from ${from} to ${to}.`);
        }
      }, { mode: 'in-memory' });
      var child = yield parent.createChild({
        initialize: function(selfActor) {
          this.parent = selfActor.getParent();
        },

        hello: function(from, to) {
          this.parent.send('helloReply', to, from);
        }
      }, { mode: 'remote', host: '127.0.0.1' });

      yield child.send('hello', 'Bob', 'Alice');

      var result = yield replyDfd.promise;

      expect(result).to.be.equal('Hello reply from Alice to Bob.');
    }));
  });

  describe('createChild()', function() {
    it('should support ES6 class behaviour definitions', function() {
      class TestBase {
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
      var TestActor = function() {
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

    it('should be able to pass custom parameters to child actor', P.coroutine(function*() {
      class MyActor {
        initialize(selfActor) {
          this.helloResponse = selfActor.getCustomParameters().helloResponse;
        }

        hello() {
          return this.helloResponse;
        }
      }

      // Create child actor with custom parameter.
      var childActor = yield rootActor.createChild(MyActor, {
        mode: 'remote',
        host: '127.0.0.1',
        customParameters: { helloResponse: 'Hi there!' }
      });

      var response = yield childActor.sendAndReceive('hello');

      expect(response).to.be.equal('Hi there!');
    }));
  });

  describe('createChildren()', function() {
    it('should create module actor children from a specified directory', P.coroutine(function*() {
      var childActors = yield rootActor.createChildren(
        '/test-resources/actors/child-actors',
        { mode: 'remote', host: '127.0.0.1' });

      expect(childActors.length).to.be.equal(2);

      var childActorNames = _.map(childActors, actor => actor.getName());

      expect(childActorNames).to.have.members(['ChildActor1', 'ChildActor2']);

      var childActorReplies = yield P.map(childActors, actor => actor.sendAndReceive('hello'));

      expect(childActorReplies).to.have.members(['Hello from ChildActor1', 'Hello from ChildActor2']);
    }));
  });

  describe('forwardToChild()', function() {
    it('should forward messages with given topics to a given child actor', P.coroutine(function*() {
      var parent = yield rootActor.createChild({
        initialize: selfActor => {
          // Create first child that receives 'hello' messages and sends 'tell...' messages to parent.
          var child1Promise = selfActor
            .createChild({
              initialize: function(selfActor) {
                this.parent = selfActor.getParent();
              },

              hello: function(msg) {
                return this.parent.sendAndReceive('tellChild2', msg);
              }
            }, { mode: 'remote', host: '127.0.0.1' })
            .then(child1 => {
              // Forward 'hello' messages to this child.
              return selfActor.forwardToChild(child1, 'hello');
            });

          // Create second child that receives 'tell...' messages and writes to mailbox.
          var child2Promise = selfActor
            .createChild({
              initialize: function() {
                this.mailbox = [];
              },

              tellChild2: function(msg) {
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

          return P.join(child1Promise, child2Promise);
        }
      });

      yield parent.sendAndReceive('hello', 'World!');

      var child2Mailbox = yield parent.sendAndReceive('getMailbox');

      expect(child2Mailbox).to.have.members(['World!']);
    }));
  });

  describe('metrics()', function() {
    it('should collect metrics from target actor and all the actor sub-tree', P.coroutine(function*() {
      var parent = yield rootActor.createChild({
        metrics: function() {
          return {
            parentMetric: 111
          };
        }
      });
      yield parent.createChild({
        metrics: function() {
          return {
            childMetric: 222
          };
        }
      }, { name: 'Child1', mode: 'remote', host: '127.0.0.1' });
      yield parent.createChild({
        metrics: function() {
          return {
            childMetric: 333
          };
        }
      }, { name: 'Child2', mode: 'remote', host: '127.0.0.1' });

      var metrics = yield parent.metrics();

      expect(metrics).to.be.deep.equal({
        parentMetric: 111,
        Child1: {
          childMetric: 222
        },
        Child2: {
          childMetric: 333
        }
      });
    }));
  });
});