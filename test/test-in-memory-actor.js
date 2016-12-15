/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/* eslint require-jsdoc: "off" */

var actors = require('../index');
var Actor = require('../lib/actor.js');
var tu = require('../lib/utils/test.js');
var expect = require('chai').expect;
var P = require('bluebird');
var _ = require('underscore');

var system;
var rootActor;

describe('InMemoryActor', function() {
  beforeEach(function() {
    system = actors({
      log: tu.logStub(),
      additionalRequires: 'ts-node/register'
    });

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  afterEach(function() {
    return system.destroy();
  });

  it('should put received messages in the queue until initialized', P.coroutine(function*() {
    var helloReceivedBeforeInitialized = false;

    class LongStartingActor {
      initialize(selfActor) {
        this.initialized = false;

        return selfActor
          .createChild({
            initialize: function(selfActor) {
              return selfActor.getParent().send('hello', 'Child');
            }
          })
          .then(() => {
            this.initialized = true;
          });
      }

      hello(to) {
        helloReceivedBeforeInitialized = !this.initialized;

        return `Hello to ${to}`;
      }
    }

    yield rootActor.createChild(LongStartingActor);

    expect(helloReceivedBeforeInitialized).to.be.equal(false);
  }));

  describe('send()', function() {
    it('should send a message to an actor', function() {
      var externalState = 0;

      return rootActor
        .createChild({
          myMessage: (msg) => {
            externalState += msg.count;
          }
        })
        .then(testActor => {
          expect(testActor.getParent().getId()).to.be.equal(rootActor.getId());

          return testActor.send('myMessage', { count: 3 });
        })
        .then(() => {
          expect(externalState).to.be.equal(3);
        });
    });

    it('should throw error if message handler was not found', function(done) {
      rootActor
        .createChild({
          myMessage: 'OK'
        })
        .then(testActor => testActor.send('myOtherMessage', 'Hello!'))
        .then(() => {
          done('Expected error');
        })
        .catch(err => {
          expect(err.message).to.match(/No handler for message/);
        })
        .then(done)
        .catch(done);
    });

    it('should not throw error if handler threw error', function() {
      return rootActor
        .createChild({
          myMessage: () => {
            throw new Error('Sorry!');
          }
        })
        .then(testActor => testActor.send('myMessage', 'Hi!'));
    });

    it('should allow additional arguments', function() {
      var result = 0;

      return rootActor
        .createChild({
          calculateSum: (left, right) => result = left + right
        })
        .then(actor => actor.sendAndReceive('calculateSum', 1, 2))
        .then(() => expect(result).to.be.equal(3));
    });
  });

  describe('sendAndReceive()', function() {
    it('should send a message to an actor and receive response', function() {
      return rootActor
        .createChild({
          howMany: msg => msg.length
        })
        .then(testActor => testActor.sendAndReceive('howMany', [1, 2, 3]))
        .then(result => {
          expect(result).to.be.equal(3);
        });
    });

    it('should throw error if message handler was not found', function(done) {
      rootActor
        .createChild({
          myMessage: 'OK'
        })
        .then(testActor => testActor.sendAndReceive('myOtherMessage', 'Hello!'))
        .then(() => {
          done('Expected error');
        })
        .catch(err => {
          expect(err.message).to.match(/No handler for message/);
        })
        .then(done)
        .catch(done);
    });

    it('should throw error if handler threw error', function(done) {
      rootActor
        .createChild({
          myMessage: () => {
            throw new Error('Sorry!');
          }
        })
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

    it('should support variable arguments', function() {
      return rootActor
        .createChild({
          sayHello: (to, from) => 'Hello to ' + to + ' from ' + from
        })
        .then(actor => actor.sendAndReceive('sayHello', 'Bob', 'Jack'))
        .then(result => expect(result).to.be.equal('Hello to Bob from Jack'));
    });
  });

  describe('createChild()', function() {
    it('should support ES6 class behaviour definitions', function() {
      class TestActor {
        initialize(selfActor) {
          expect(selfActor).to.be.instanceof(Actor);

          this.name = 'TestActor';
        }

        sayHello() {
          return 'Hello from ' + this.name;
        }
      }

      return rootActor
        .createChild(TestActor)
        .then(testActor => testActor.sendAndReceive('sayHello'))
        .then(result => expect(result).to.be.equal('Hello from TestActor'));
    });

    it('should support ES5 class behaviour definitions', function() {
      var TestActor = function() {};

      TestActor.prototype.initialize = function(selfActor) {
        expect(selfActor).to.be.instanceof(Actor);

        this.name = 'TestActor';
      };
      TestActor.prototype.sayHello = function() {
        return 'Hello from ' + this.name;
      };

      return rootActor
        .createChild(TestActor)
        .then(testActor => testActor.sendAndReceive('sayHello'))
        .then(result => expect(result).to.be.equal('Hello from TestActor'));
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
    it('should create module actor children from a specified directory', P.coroutine(function*() {
      var childActors = yield rootActor.createChildren('/test-resources/actors/child-actors');

      expect(childActors.length).to.be.equal(2);

      var childActorNames = _.map(childActors, actor => actor.getName());

      expect(childActorNames).to.have.members(['ChildActor1', 'ChildActor2']);

      var childActorReplies = yield P.map(childActors, actor => actor.sendAndReceive('hello'));

      expect(childActorReplies).to.have.members(['Hello from ChildActor1', 'Hello from ChildActor2']);
    }));
  });

  describe('forwardToParent()', function() {
    it('should forward messages with given topics to parent actor', P.coroutine(function*() {
      var result = 0;

      var childActor = yield rootActor.createChild({
        plus: n => result += n,
        times: n => result *= n
      });
      var grandChildActor = yield childActor.createChild({
        initialize: selfActor => selfActor.forwardToParent('plus', 'times')
      });

      yield grandChildActor.send('plus', 2);
      yield grandChildActor.send('times', 3);

      expect(result).to.be.equal(6);
    }));

    it('should support regular expressions', P.coroutine(function*() {
      var result = 0;

      var childActor = yield rootActor.createChild({
        mathPlus: n => result += n,
        mathTimes: n => result *= n
      });
      var grandChildActor = yield childActor.createChild({
        initialize: selfActor => selfActor.forwardToParent(/^math/)
      });

      yield grandChildActor.send('mathPlus', 2);
      yield grandChildActor.send('mathTimes', 3);

      expect(result).to.be.equal(6);
    }));
  });

  describe('forwardToChild()', function() {
    it('should forward messages with given topics to a given child actor', P.coroutine(function*() {
      var child2Mailbox = [];
      var parent = yield rootActor.createChild({
        initialize: selfActor => {
          // Create first child that receives 'hello' messages and sends 'tell...' messages to parent.
          var child1Promise = selfActor
            .createChild({
              initialize: selfActor => {
                this.parent = selfActor.getParent();
              },

              hello: msg => {
                return this.parent.sendAndReceive('tellChild2', msg);
              }
            })
            .then(child1 => {
              // Forward 'hello' messages to this child.
              return selfActor.forwardToChild(child1, 'hello');
            });

          // Create second child that receives 'tell...' messages and writes to mailbox.
          var child2Promise = selfActor
            .createChild({
              tellChild2: msg => {
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

      yield parent.sendAndReceive('hello', 'World!');

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
      }, { name: 'Child1' });
      yield parent.createChild({
        metrics: function() {
          return {
            childMetric: 333
          };
        }
      }, { name: 'Child2' });

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

  describe('destroy()', function() {
    it('should call destroy() method in behaviour object', P.coroutine(function*() {
      var destroyed = false;
      var childActor = yield rootActor.createChild({
        destroy: () => destroyed = true
      });

      yield childActor.destroy();

      expect(destroyed).to.be.equal(true);
    }));

    it('should destroy children before destroying self', P.coroutine(function*() {
      var destroyList = [];
      var childActor = yield rootActor.createChild({
        destroy: () => destroyList.push('child')
      });
      yield childActor.createChild({
        destroy: () => destroyList.push('grandchild')
      });

      yield rootActor.destroy();

      expect(destroyList).to.be.deep.equal(['grandchild', 'child']);
    }));
  });
});