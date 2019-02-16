/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

import {ActorSystem, Actor} from '../../index';
import {afterEach} from 'mocha';
import * as actors from '../../index';
import {expect} from 'chai';

let testSystem: ActorSystem;

describe('ActorSystem', function() {
  afterEach(function() {
    if (testSystem) {
      return testSystem.destroy();
    }
  });

  it('should destroy all actors and call proper hooks upon destruction', async () => {
    let hookList: string[] = [];

    class MyResource {
      getResource() {
        return 'MyResource value';
      }

      destroy() {
        hookList.push('resource');
      }
    }

    class RootActor {
      static inject() {
        return ['MyResource'];
      }

      destroy() {
        hookList.push('root');
      }
    }

    testSystem = actors.createSystem({
      resources: [MyResource],
      root: RootActor,
      test: true
    });

    let rootActor = await testSystem.rootActor();

    await rootActor.createChild({
      initialize: function(selfActor) {
        return selfActor.createChild({
          destroy: () => hookList.push('grandchild')
        });
      },

      destroy: () => hookList.push('child')
    });

    await testSystem.destroy();

    expect(hookList).to.be.deep.equal(['grandchild', 'child', 'root', 'resource']);
  });

  describe('Custom logger', function() {
    it('should support custom loggers', async () => {
      let loggerMessages: {
        error: string[][],
        warn: string[][],
        info: string[][],
        debug: string[][]
      } = {
        error: [],
        warn: [],
        info: [],
        debug: []
      };

      class MyLogger {
        error(...msg: string[]) {
          loggerMessages.error.push(msg);
        }

        warn(...msg: string[]) {
          loggerMessages.warn.push(msg);
        }

        info(...msg: string[]) {
          loggerMessages.info.push(msg);
        }

        debug(...msg: string[]) {
          loggerMessages.debug.push(msg);
        }
      }

      class MyActor {
        private log: any;
        initialize(selfActor: Actor) {
          this.log = selfActor.getLog();
        }

        test(msg: string) {
          this.log.info(msg);
        }
      }

      testSystem = actors.createSystem({
        test: true,
        root: MyActor,
        logger: MyLogger,
        loggerConfig: {
          categories: {
            default: 'Silent',
            MyActor: 'Info'
          }
        }
      });

      await testSystem.rootActor().then(actor => actor.sendAndReceive('test', 'Hello!'));

      expect(loggerMessages.info).to.have.length(1);
      expect(loggerMessages.info[0][1]).to.be.equal('Hello!');
    });

    it('should reject custom loggers with improper interface', () => {
      class MyImproperLogger {
        test(...msg: string[]) {
          console.log('Test');
        }
      }

      class MyActor {
        private log: any;
        initialize(selfActor: Actor) {
          this.log = selfActor.getLog();
        }

        test(msg: string) {
          this.log.info(msg);
        }
      }

      let error;

      try {
        testSystem = actors.createSystem({
          test: true,
          root: MyActor,
          logger: MyImproperLogger,
          loggerConfig: {
            categories: {
              default: 'Silent',
              MyActor: 'Info'
            }
          }
        });
      }
      catch (err) {
        error = err;
      }

      expect(error).to.be.an.instanceOf(Error);
    });

    it('should support custom loggers specified by module path', async () => {
      class MyActor {
        private log: any;
        initialize(selfActor: Actor) {
          this.log = selfActor.getLog();
        }

        test(msg: string) {
          this.log.info(msg);
        }
      }

      testSystem = actors.createSystem({
        test: true,
        root: MyActor,
        logger: '/test-resources/test-logger',
        loggerConfig: {
          categories: {
            default: 'Silent',
            MyActor: 'Info'
          }
        }
      });

      await testSystem.rootActor().then(actor => actor.sendAndReceive('test', 'Hello!'));

      let loggerMessages = testSystem.getLog().getImplementation().getLoggerMessages();

      expect(loggerMessages.info).to.have.length(1);
      expect(loggerMessages.info[0][1]).to.be.equal('Hello!');
    });

    it('should be able to pass custom logger across process boundary', async () => {
      class MyActor {
        private log: any;
        initialize(selfActor: Actor) {
          this.log = selfActor.getLog();
        }

        test(msg: string) {
          this.log.info(msg);
        }

        getLoggerMessages() {
          return this.log.getImplementation().getLoggerMessages();
        }
      }

      testSystem = actors.createSystem({
        test: true,
        logger: '/test-resources/test-logger',
        loggerConfig: {
          categories: {
            default: 'Silent',
            MyActor: 'Info'
          }
        }
      });

      let rootActor = await testSystem.rootActor();
      let childActor = await rootActor.createChild(MyActor, { mode: 'forked' });

      await childActor.sendAndReceive('test', 'Hello!');

      let loggerMessages = await childActor.sendAndReceive('getLoggerMessages');

      expect(loggerMessages.info).to.have.length(1);
      expect(loggerMessages.info[0][1]).to.be.equal('Hello!');
    });
  });
});
