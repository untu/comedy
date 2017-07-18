/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var actors = require('../index');
var expect = require('chai').expect;
var P = require('bluebird');
var _ = require('underscore');

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

  it('should run resource lifecycle hooks for used resources', P.coroutine(function*() {
    var messageResourceInitialized = false;
    var messageResourceDestroyed = false;
    var unusedResourceInitialized = false;
    var unusedResourceDestroyed = false;

    /**
     * Test resource.
     */
    class MessageResource {
      static getName() {
        return 'message-text';
      }

      initialize() {
        this.text = 'Hi there!';
        messageResourceInitialized = true;
      }

      destroy() {
        messageResourceDestroyed = true;
      }

      getResource() {
        return this.text;
      }
    }

    /**
     * Test unused resource.
     */
    class UnusedResource {
      static getName() {
        return 'unused';
      }

      initialize() {
        unusedResourceInitialized = true;
      }

      destroy() {
        unusedResourceDestroyed = true;
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
      resources: [MessageResource, UnusedResource]
    });

    var actor = yield system.rootActor().then(rootActor => rootActor.createChild(MyActor));

    var response = yield actor.sendAndReceive('hello');

    expect(response).to.be.equal('Hi there!');

    yield system.destroy();

    expect(messageResourceInitialized).to.be.equal(true);
    expect(messageResourceDestroyed).to.be.equal(true);
    expect(unusedResourceInitialized).to.be.equal(false);
    expect(unusedResourceDestroyed).to.be.equal(false);
  }));

  it('should support module-defined resources for in-memory actor', P.coroutine(function*() {
    /**
     * Test actor, that uses test resource.
     */
    class MyActor {
      static inject() {
        return ['MessageResource'];
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
      resources: ['/test-resources/test-message-resource']
    });

    var actor = yield system.rootActor().then(rootActor => rootActor.createChild(MyActor));

    var response = yield actor.sendAndReceive('hello');

    expect(response).to.be.equal('Hi there!');
  }));

  it('should support module-defined resources for forked actor', P.coroutine(function*() {
    /**
     * Test actor, that uses test resource.
     */
    class MyActor {
      static inject() {
        return ['MessageResource'];
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
      resources: ['/test-resources/test-message-resource']
    });

    var actor = yield system.rootActor().then(rootActor => rootActor.createChild(MyActor, { mode: 'forked' }));

    var response = yield actor.sendAndReceive('hello');

    expect(response).to.be.equal('Hi there!');
  }));

  it('should support TypeScript module-defined resources for in-memory actor', P.coroutine(function*() {
    /**
     * Test actor, that uses test resource.
     */
    class MyActor {
      static inject() {
        return ['MessageResource'];
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
      resources: ['/test-resources/test-typescript-message-resource'],
      additionalRequires: 'ts-node/register'
    });

    var actor = yield system.rootActor().then(rootActor => rootActor.createChild(MyActor));

    var response = yield actor.sendAndReceive('hello');

    expect(response).to.be.equal('Hi there!');
  }));

  it('should support TypeScript module-defined resources for forked actor', P.coroutine(function*() {
    /**
     * Test actor, that uses test resource.
     */
    class MyActor {
      static inject() {
        return ['MessageResource'];
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
      resources: ['/test-resources/test-typescript-message-resource'],
      additionalRequires: 'ts-node/register'
    });

    var actor = yield system.rootActor().then(rootActor => rootActor.createChild(MyActor, { mode: 'forked' }));

    var response = yield actor.sendAndReceive('hello');

    expect(response).to.be.equal('Hi there!');
  }));

  it('should support plain-object resources', P.coroutine(function*() {
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
      resources: [{
        getName: _.constant('message-text'),
        getResource: _.constant('Hi there!')
      }]
    });

    var actor = yield system.rootActor().then(rootActor => rootActor.createChild(MyActor));

    var response = yield actor.sendAndReceive('hello');

    expect(response).to.be.equal('Hi there!');
  }));

  it('should support resource dependencies', P.coroutine(function*() {
    /**
     * Test resource dependency.
     */
    class MyResourceDependency {
      static getName() {
        return 'resource-dependency';
      }

      getResource() {
        return 'dependency';
      }
    }

    /**
     * Test resource with dependency.
     */
    class MyResource {
      static inject() {
        return ['resource-dependency'];
      }

      static getName() {
        return 'resource';
      }

      constructor(dependency) {
        this.dependency = dependency;
      }

      getResource() {
        return 'resource ' + this.dependency;
      }
    }

    /**
     * Test actor.
     */
    class MyActor {
      static inject() {
        return ['resource'];
      }

      constructor(resource) {
        this.resource = resource;
      }

      getResourceValue() {
        return this.resource;
      }
    }

    system = actors({
      test: true,
      resources: [MyResourceDependency, MyResource]
    });

    var actor = yield system.rootActor().then(rootActor => rootActor.createChild(MyActor));

    var response = yield actor.sendAndReceive('getResourceValue');

    expect(response).to.be.equal('resource dependency');
  }));

  it('should properly handle cyclic resource dependencies', P.coroutine(function*() {
    /**
     * Test resource 1.
     */
    class Resource1 {
      static inject() {
        return ['Resource3'];
      }

      getResource() {
        return 'Resource1';
      }
    }

    /**
     * Test resource 2.
     */
    class Resource2 {
      static inject() {
        return ['Resource1'];
      }

      getResource() {
        return 'Resource2';
      }
    }

    /**
     * Test resource 3.
     */
    class Resource3 {
      static inject() {
        return ['Resource2'];
      }

      getResource() {
        return 'Resource3';
      }
    }

    /**
     * Test actor.
     */
    class MyActor {
      static inject() {
        return ['Resource3'];
      }

      constructor(resource) {
        this.resource = resource;
      }

      getResourceValue() {
        return this.resource;
      }
    }

    system = actors({
      test: true,
      resources: [Resource1, Resource2, Resource3]
    });

    var error;
    yield system.rootActor()
      .then(rootActor => rootActor.createChild(MyActor))
      .catch(err => {
        error = err;
      });

    expect(error).to.be.an.instanceof(Error);

    system = undefined; // system.destroy() would cause resource dependency error.
  }));
});