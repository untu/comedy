/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/* eslint require-jsdoc: "off" */

let actors = require('../index');
let Actor = require('../lib/actor.js');
let expect = require('chai').expect;
let fs = require('fs');
let os = require('os');
let path = require('path');
let P = require('bluebird');
let _ = require('underscore');

let system;
let rootActor;

describe('InMemoryActor', function() {
  beforeEach(function() {
    system = actors({
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
    it('should not receive messages until initialized', P.coroutine(function*() {
      class LongStartingActor {
        initialize(selfActor) {
          this.initialized = false;

          return selfActor
            .createChild({
              initialize: function(selfActor) {
                // This should throw error as parent has not yet been initialized.
                return selfActor.getParent().send('hello', 'Child');
              }
            })
            .then(() => {
              this.initialized = true;
            });
        }

        hello(to) {
          return `Hello to ${to}`;
        }
      }

      let err;

      try {
        yield rootActor.createChild(LongStartingActor);
      }
      catch (err0) {
        err = err0;
      }

      expect(err).to.be.not.equal(undefined);
      expect(err.message).to.match(/Actor has not yet been initialized\./);
    }));

    it('should throw error for sendAndReceive during initialization', P.coroutine(function*() {
      class LongStartingActor {
        initialize(selfActor) {
          this.initialized = false;

          return selfActor
            .createChild({
              initialize: function(selfActor) {
                return selfActor.getParent().sendAndReceive('hello', 'Child');
              }
            })
            .then(() => {
              this.initialized = true;
            });
        }

        hello(to) {
          return `Hello to ${to}`;
        }
      }

      let error;

      try {
        yield rootActor.createChild(LongStartingActor);
      }
      catch (err) {
        error = err;

        expect(err.message).to.match(/Actor has not yet been initialized\./);
      }

      expect(error).to.be.defined;
    }));
  });

  describe('send()', function() {
    it('should send a message to an actor', function() {
      let externalState = 0;

      return rootActor
        .createChild({
          myMessage: (msg) => {
            externalState += msg.count;
          }
        })
        .then(testActor => testActor.send('myMessage', { count: 3 }))
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
      let result = 0;

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
      let TestActor = function() {};

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

    it('should support global module lookup', P.coroutine(function*() {
      fs.copyFileSync(
        path.join(__dirname, '../test-resources/actors/child-actors/child-actor-1.js'),
        path.join(os.tmpdir(), 'child-actor-1.js'));

      let child = yield rootActor.createChild(`//${os.tmpdir()}/child-actor-1`);

      expect(child.getName()).to.be.equal('ChildActor1');

      let resp = yield child.sendAndReceive('hello');

      expect(resp).to.be.equal('Hello from ChildActor1');
    }));
  });

  describe('createChildren()', function() {
    it('should create module actor children from a specified directory', P.coroutine(function*() {
      let childActors = yield rootActor.createChildren('/test-resources/actors/child-actors');

      expect(childActors.length).to.be.equal(2);

      let childActorNames = _.map(childActors, actor => actor.getName());

      expect(childActorNames).to.have.members(['ChildActor1', 'ChildActor2']);

      let childActorReplies = yield P.map(childActors, actor => actor.sendAndReceive('hello'));

      expect(childActorReplies).to.have.members(['Hello from ChildActor1', 'Hello from ChildActor2']);
    }));

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
      let childActor = yield rootActor.createChild(MyActor, { customParameters: { helloResponse: 'Hi there!' } });

      let response = yield childActor.sendAndReceive('hello');

      expect(response).to.be.equal('Hi there!');
    }));
  });

  describe('forwardToParent()', function() {
    it('should forward messages with given topics to parent actor', P.coroutine(function*() {
      let result = 0;

      let parentActor = yield rootActor.createChild({
        initialize: async function(selfActor) {
          this.child = await selfActor.createChild({
            initialize: selfActor => selfActor.forwardToParent('plus', 'times')
          });
        },

        plus: n => result += n,

        times: n => result *= n,

        sendToChild: function(op, val) {
          return this.child.sendAndReceive(op, val);
        }
      });

      yield parentActor.sendAndReceive('sendToChild', 'plus', 2);
      yield parentActor.sendAndReceive('sendToChild', 'times', 3);

      expect(result).to.be.equal(6);
    }));

    it('should support regular expressions', P.coroutine(function*() {
      let result = 0;

      let parentActor = yield rootActor.createChild({
        initialize: async function(selfActor) {
          this.child = await selfActor.createChild({
            initialize: selfActor => selfActor.forwardToParent(/^math/)
          });
        },

        mathPlus: n => result += n,

        mathTimes: n => result *= n,

        sendToChild: function(op, val) {
          return this.child.sendAndReceive(op, val);
        }
      });

      yield parentActor.sendAndReceive('sendToChild', 'mathPlus', 2);
      yield parentActor.sendAndReceive('sendToChild', 'mathTimes', 3);

      expect(result).to.be.equal(6);
    }));
  });

  describe('forwardToChild()', function() {
    it('should forward messages with given topics to a given child actor', P.coroutine(function*() {
      let child2Mailbox = [];
      let parent = yield rootActor.createChild({
        initialize: selfActor => {
          // Create first child that receives 'hello' messages and sends 'tell...' messages to parent.
          let child1Promise = selfActor
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
          let child2Promise = selfActor
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
      let parent = yield rootActor.createChild({
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

      let metrics = yield parent.metrics();

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

    it('should not collect metrics from destroyed actors', P.coroutine(function*() {
      let parent = yield rootActor.createChild({
        initialize: async function(selfActor) {
          this.child1 = await selfActor.createChild({
            metrics: function() {
              return {
                childMetric: 222
              };
            }
          }, { name: 'Child1', mode: 'in-memory' });
          this.child2 = await selfActor.createChild({
            metrics: function() {
              return {
                childMetric: 333
              };
            }
          }, { name: 'Child2', mode: 'in-memory' });
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

      yield parent.sendAndReceive('killChild2');

      let metrics = yield parent.metrics();

      expect(metrics).to.be.deep.equal({
        parentMetric: 111,
        Child1: {
          childMetric: 222
        }
      });
    }));
  });

  describe('destroy()', function() {
    it('should call destroy() method in behaviour object', P.coroutine(function*() {
      let destroyed = false;
      let childActor = yield rootActor.createChild({
        destroy: () => destroyed = true
      });

      yield childActor.destroy();

      expect(destroyed).to.be.equal(true);
    }));

    it('should destroy children before destroying self', P.coroutine(function*() {
      let destroyList = [];
      yield rootActor.createChild({
        initialize: function(selfActor) {
          return selfActor.createChild({
            destroy: () => destroyList.push('grandchild')
          });
        },

        destroy: () => destroyList.push('child')
      });

      yield rootActor.destroy();

      expect(destroyList).to.be.deep.equal(['grandchild', 'child']);
    }));
  });
});