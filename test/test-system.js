'use strict';

/* eslint require-jsdoc: "off" */

var expect = require('chai').expect;
var actors = require('../index');
var P = require('bluebird');

var testSystem;

describe('ActorSystem', function() {
  afterEach(function() {
    if (testSystem) {
      return testSystem.destroy();
    }
  });

  it('should allow creating actor system with given class-defined context', function() {
    testSystem = actors({
      context: {
        initialize: function() {
          this.parameter = 'My value';
        },

        getParameter: function() {
          return this.parameter;
        }
      },
      test: true
    });

    return testSystem.rootActor()
      .then(rootActor => {
        expect(rootActor.getContext().getParameter()).to.be.equal('My value');
      });
  });

  it('should allow creating actor system with given module-defined context', function() {
    testSystem = actors({
      context: '/test-resources/actors/test-actor-context',
      test: true
    });

    return testSystem.rootActor()
      .then(rootActor => {
        expect(rootActor.getContext().getParameter()).to.be.equal('Hello!');
      });
  });

  it('should support class-defined contexts', function() {
    class MyContext {
      initialize() {
        this.paramter = 'My value';
      }

      getParameter() {
        return this.paramter;
      }
    }

    testSystem = actors({ context: MyContext, test: true });

    return testSystem.rootActor()
      .then(rootActor => {
        expect(rootActor.getContext().getParameter()).to.be.equal('My value');
      });
  });

  it('should re-create context in forked systems', function() {
    testSystem = actors({
      context: {
        initialize: function() {
          this.parameter = 'Bob';
        },

        getParameter: function() {
          return this.parameter;
        }
      },
      test: true
    });

    return testSystem.rootActor()
      .then(rootActor => rootActor.createChild({
        initialize: function(selfActor) {
          this.name = selfActor.getContext().getParameter();
        },

        sayHello: function() {
          return 'Hello, ' + this.name + '!';
        }
      }, { mode: 'forked' }))
      .then(forkedActor => forkedActor.sendAndReceive('sayHello'))
      .then(result => {
        expect(result).to.be.equal('Hello, Bob!');
      });
  });

  it('should re-create class-defined context in forked systems', function() {
    class MyContext {
      initialize() {
        this.paramter = 'Bob';
      }

      getParameter() {
        return this.paramter;
      }
    }

    testSystem = actors({ context: MyContext, test: true });

    return testSystem.rootActor()
      .then(rootActor => rootActor.createChild({
        initialize: function(selfActor) {
          this.name = selfActor.getContext().getParameter();
        },

        sayHello: function() {
          return 'Hello, ' + this.name + '!';
        }
      }, { mode: 'forked' }))
      .then(forkedActor => forkedActor.sendAndReceive('sayHello'))
      .then(result => {
        expect(result).to.be.equal('Hello, Bob!');
      });
  });

  it('should re-create module-defined context in forked systems', function() {
    testSystem = actors({
      context: '/test-resources/actors/test-actor-context',
      test: true
    });

    return testSystem.rootActor()
      .then(rootActor => rootActor.createChild({
        initialize: function(selfActor) {
          this.name = selfActor.getContext().getParameter();
        },

        sayHello: function() {
          return 'Hello, ' + this.name + '!';
        }
      }, { mode: 'forked' }))
      .then(forkedActor => forkedActor.sendAndReceive('sayHello'))
      .then(result => {
        expect(result).to.be.equal('Hello, Hello!!');
      });
  });

  it('should properly inject resources defined in contexts', function() {
    class MyContext {
      initialize() {
        this.resource = 'My resource';
      }

      getResource() {
        return this.resource;
      }
    }

    class MyActor {
      static inject() {
        return ['resource'];
      }

      constructor(resource) {
        this.resource = resource;
      }

      ping() {
        return 'Pong with ' + this.resource;
      }
    }

    testSystem = actors({ context: MyContext, test: true });

    return testSystem.rootActor()
      .then(rootActor => rootActor.createChild(MyActor))
      .then(actor => actor.sendAndReceive('ping'))
      .then(result => {
        expect(result).to.be.equal('Pong with My resource');
      });
  });

  it('should throw error if the requested resource is not present in context', function() {
    class MyActor {
      static inject() {
        return ['resource'];
      }

      constructor(resource) {
        this.resource = resource;
      }

      ping() {
        return 'Pong with ' + this.resource;
      }
    }

    testSystem = actors({ context: {}, test: true });
    var error = false;

    return testSystem.rootActor()
      .then(rootActor => rootActor.createChild(MyActor))
      .catch(err => {
        expect(err.message).to.match(/^Failed to inject resource/);
        error = true;
      })
      .then(() => {
        expect(error).to.be.equal(true); // Expect error.
      });
  });

  it('should destroy all actors and call proper hooks upon destruction', P.coroutine(function*() {
    var hookList = [];
    testSystem = actors({
      context: {
        destroy: () => hookList.push('context')
      },
      root: {
        destroy: () => hookList.push('root')
      },
      test: true
    });

    var rootActor = yield testSystem.rootActor();
    var childActor = yield rootActor.createChild({
      destroy: () => hookList.push('child')
    });
    yield childActor.createChild({
      destroy: () => hookList.push('grandchild')
    });

    yield testSystem.destroy();

    expect(hookList).to.be.deep.equal(['grandchild', 'child', 'root', 'context']);
  }));
});