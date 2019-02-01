/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let actors = require('../index');
let chai = require('chai');
let os = require('os');

chai.use(require('chai-like'));

let expect = chai.expect;
let testSystem;

describe('Actor configuration', function() {
  afterEach(() => testSystem && testSystem.destroy());

  it('should properly configure actors in forked process', async function() {
    testSystem = actors({
      config: {
        testRoot: {
          mode: 'forked'
        },
        testGenOne: {
          mode: 'forked',
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

    let rootActor = await testSystem.rootActor();
    await rootActor.createChild(TestRoot);

    let tree = await rootActor.tree();
    let hostname = os.hostname();

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
              name: 'testGenOneRoundRobinBalancer',
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
  });

  it('should take less priority than local actor parameters in createChild()', async function() {
    testSystem = actors({
      config: {
        Test: {
          mode: 'forked'
        }
      },
      test: true
    });

    let rootActor = await testSystem.rootActor();
    let testActor = await rootActor.createChild({}, { name: 'Test', mode: 'in-memory' });

    expect(testActor.getMode()).to.be.equal('in-memory');
  });
});