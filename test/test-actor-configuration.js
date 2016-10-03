'use strict';

var actors = require('../index');
var chai = require('chai');
var P = require('bluebird');
var os = require('os');

chai.use(require('chai-like'));

var expect = chai.expect;

describe('Actor configuration', function() {
  it('should properly configure actors in local process', P.coroutine(function*() {
    var testSystem = actors({
      config: {
        testRoot: {
          mode: 'in-memory'
        },
        testGenOne: {
          mode: 'in-memory',
          clusterSize: 3
        }
      },
      test: true
    });

    /**
     * Test root actor.
     */
    class TestRoot {
      /**
       * Initializes this actor.
       *
       * @param {Actor} selfActor Self actor.
       * @returns {P} Initialization promise.
       */
      initialize(selfActor) {
        return selfActor.createChild({
          name: 'testGenOne'
        });
      }
    }

    var rootActor = yield testSystem.rootActor();
    yield rootActor.createChild(TestRoot);

    var tree = yield rootActor.tree();
    var hostname = os.hostname();

    expect(tree).to.be.like({
      name: 'Root',
      location: {
        hostname: hostname,
        pid: process.pid
      },
      children: [
        {
          name: TestRoot.name,
          location: {
            hostname: hostname,
            pid: process.pid
          },
          children: [
            {
              name: 'RoundRobinBalancer',
              location: {
                hostname: hostname,
                pid: process.pid
              },
              children: [
                {
                  name: 'testGenOne',
                  location: {
                    hostname: hostname,
                    pid: process.pid
                  }
                },
                {
                  name: 'testGenOne',
                  location: {
                    hostname: hostname,
                    pid: process.pid
                  }
                },
                {
                  name: 'testGenOne',
                  location: {
                    hostname: hostname,
                    pid: process.pid
                  }
                }
              ]
            }
          ]
        }
      ]
    });
  }));

  it('should properly configure actors in forked process', P.coroutine(function*() {
    var testSystem = actors({
      config: {
        testRoot: {
          mode: 'forked'
        },
        testGenOne: {
          mode: 'in-memory',
          clusterSize: 3
        }
      },
      test: true
    });

    /**
     * Test root actor.
     */
    class TestRoot {
      /**
       * Initializes this actor.
       *
       * @param {Actor} selfActor Self actor.
       * @returns {P} Initialization promise.
       */
      initialize(selfActor) {
        return selfActor.createChild({
          name: 'testGenOne'
        });
      }
    }

    var rootActor = yield testSystem.rootActor();
    yield rootActor.createChild(TestRoot);

    var tree = yield rootActor.tree();
    var hostname = os.hostname();

    expect(tree).to.be.like({
      name: 'Root',
      location: {
        hostname: hostname,
        pid: process.pid
      },
      children: [
        {
          name: TestRoot.name,
          children: [
            {
              name: 'RoundRobinBalancer',
              children: [
                {
                  name: 'testGenOne'
                },
                {
                  name: 'testGenOne'
                },
                {
                  name: 'testGenOne'
                }
              ]
            }
          ]
        }
      ]
    });
  }));
});