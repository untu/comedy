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
});