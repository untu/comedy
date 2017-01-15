'use strict';

var actors = require('../index');
var expect = require('chai').expect;
var P = require('bluebird');

var system;

describe('Resource injection', function() {
  afterEach(function() {
    return system && system.destroy();
  });

  it('should inject resource into an in-memory actor', P.coroutine(function*() {
    /**
     * Test resource.
     */
    class MessageResource {
      static getName() {
        return 'message-text';
      }

      getResource() {
        return 'Hi there!';
      }
    }

    /**
     * Test actor, that uses test resource.
     */
    class MyActor {
      static inject() {
        return ['message-text'];
      }

      constructor(message) {
        this.message = message;
      }

      hello() {
        return this.message;
      }
    }

    system = actors({
      test: true,
      resources: [MessageResource]
    });

    var actor = yield system.rootActor().then(rootActor => rootActor.createChild(MyActor));

    var response = yield actor.sendAndReceive('hello');

    expect(response).to.be.equal('Hi there!');
  }));

  it('should inject resource into a forked actor', function() {
    throw new Error('TODO');
  });

  it('should run resource lifecycle hooks', function() {
    throw new Error('TODO');
  });

  it('should not initialize an unused resource', function() {
    throw new Error('TODO');
  });

  it('should support module-defined resources', function() {
    throw new Error('TODO');
  });

  it('should support TypeScript module-defined resources', function() {
    throw new Error('TODO');
  });
});