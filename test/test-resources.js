/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var actors = require('../index');
var expect = require('chai').expect;
var P = require('bluebird');

var system;

describe('Resource injection', function() {
  afterEach(P.coroutine(function*() {
    if (system) {
      yield system.destroy();
    }

    system = null;
  }));

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

  it('should inject resource into a forked actor', P.coroutine(function*() {
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

    var actor = yield system.rootActor().then(rootActor => rootActor.createChild(MyActor, { mode: 'forked' }));

    var response = yield actor.sendAndReceive('hello');

    expect(response).to.be.equal('Hi there!');
  }));

  it('should run resource lifecycle hooks', P.coroutine(function*() {
    var destroyed = false;

    /**
     * Test resource.
     */
    class MessageResource {
      static getName() {
        return 'message-text';
      }

      initialize() {
        this.text = 'Hi there!';
      }

      destroy() {
        destroyed = true;
      }

      getResource() {
        return this.text;
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

    var system = actors({
      test: true,
      resources: [MessageResource]
    });

    var actor = yield system.rootActor().then(rootActor => rootActor.createChild(MyActor));

    var response = yield actor.sendAndReceive('hello');

    expect(response).to.be.equal('Hi there!');

    yield system.destroy();

    expect(destroyed).to.be.equal(true);
  }));

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