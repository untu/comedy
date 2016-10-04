'use strict';

/* eslint require-jsdoc: "off" */

var actors = require('../index');
var tu = require('../lib/utils/test.js');
var expect = require('chai').expect;
var fs = require('fs');
var P = require('bluebird');

P.promisifyAll(fs);

var rootActor;

describe('ForkedActor', function() {
  before(function() {
    return actors({ test: true }).rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  describe('sendAndReceive()', function() {
    it('should throw error if handler threw error', function(done) {
      rootActor
        .createChild({
          myMessage: () => {
            throw new Error('Sorry!');
          }
        }, { mode: 'forked' })
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

    it('should fork a sub-process and perform message exchange', P.coroutine(function*() {
      var behaviour = {
        getPid: () => {
          return process.pid;
        }
      };

      var forkedChild = yield rootActor.createChild(behaviour, { mode: 'forked' });
      var forkedPid = yield forkedChild.sendAndReceive('getPid');

      expect(forkedPid).to.be.a.number;
      expect(forkedPid).to.be.not.equal(process.pid);

      // Check that child process is running.
      var psExists = fs.existsSync('/proc/' + forkedPid);

      expect(psExists).to.be.equal(true);

      // Destroy forked actor.
      yield forkedChild.destroy();

      // From this point, any additional communication should not be possible.
      var expectedErr = yield forkedChild.sendAndReceive('getPid').catch(err => err);

      expect(expectedErr).to.be.instanceof(Error);

      // The process should be stopped eventually.
      yield tu.waitForCondition(() => !fs.existsSync('/proc/' + forkedPid));
    }));

    it('should be able to import modules in forked process', P.coroutine(function*() {
      // Use module import in behaviour.
      var behaviour = {
        sayHello: () => {
          var P = require('bluebird');

          return P.resolve('Hello!');
        }
      };

      var forkedChild = yield rootActor.createChild(behaviour, { mode: 'forked' });
      var result = yield forkedChild.sendAndReceive('sayHello');

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
          .then(parent => parent.createChild(childBehaviour, { mode: 'forked' }))
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
          .then(parent => parent.createChild(childBehaviour, { mode: 'forked' }))
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
        { mode: 'forked' });

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
        { mode: 'forked' });

      var result = yield child.sendAndReceive('sayHello', new TestMessageClass(process.pid));

      expect(result).to.be.equal('Hello ' + process.pid);
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
        .createChild(TestActor, { mode: 'forked' })
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

    it('should support crashed actor respawn', P.coroutine(function*() {
      var dfd = P.pending();
      var localChild = yield rootActor.createChild({
        forkedReady: () => {
          dfd.resolve();
        }
      }, { mode: 'in-memory' });
      var forkedChild = yield localChild.createChild({
        initialize: (selfActor) => {
          process.nextTick(() => selfActor.getParent().send('forkedReady'));
        },

        kill: () => {
          process.exit(1);
        },

        ping: () => 'pong'
      }, { mode: 'forked', onCrash: 'respawn' });

      // Wait for forked actor to initialize first time.
      yield dfd.promise;

      // Create new promise.
      dfd = P.pending();

      // Kill forked actor.
      yield forkedChild.send('kill');

      // Wait for forked actor to respawn.
      yield dfd.promise;

      // Ping forked actor.
      var resp = yield forkedChild.sendAndReceive('ping');

      expect(resp).to.be.equal('pong');
    }));

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
  });
});