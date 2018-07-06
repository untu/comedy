/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let actors = require('../index');
let expect = require('chai').expect;
let P = require('bluebird');

let system;
let rootActor;

describe('SystemBus', function() {
  beforeEach(function() {
    system = actors({ test: true });
    system.listen();

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  afterEach(function() {
    return system.destroy();
  });

  describe('Event generation', () => {
    const messagesExpectationPromise = expectedMessages => {
      return new Promise((resolve, reject) => {
        let bus = rootActor.getBus();
        let handler = message => {
          let index = expectedMessages.findIndex(value => value === message);

          if (index == -1) {
            reject(`Received unexpected message '${message}'`);

            return;
          }

          expectedMessages.splice(index, 1);

          if (!expectedMessages.length) {
            resolve();
          }
        };

        bus.on('test-message-ping', handler);
        bus.on('test-message-pong', handler);
      });
    };

    /**
     * Actor definition class.
     */
    class TestActor {
      initialize(selfActor) {
        this.selfActor = selfActor;
        this.selfActor.getBus().on('test-message-ping', message => {
          if (message !== 'ping from B') { // To avoid message receiving by clustered siblings.
            this.selfActor.sendBusMessage('test-message-pong', `pong from B`);
          }
        });

        /**
         * Actor forked/remote child.
         */
        class TestActorChild {
          initialize(selfActor) {
            this.selfActor = selfActor;

            this.selfActor.getBus().on('test-message-ping', message => {
              if (message !== 'ping from C') { // To avoid message receiving by clustered siblings.
                this.selfActor.sendBusMessage('test-message-pong', `pong from C`);
              }
            });
          }

          sendPing() {
            this.selfActor.sendBusMessage('test-message-ping', `ping from C`);
          }
        }

        return this.selfActor
          .createChild(TestActorChild, {
            mode: this.selfActor.getMode(),
            host: '127.0.0.1'
          })
          .then(childActorC => {
            this.childActorC = childActorC;
          });
      }

      destroyChild() {
        return this.childActorC.destroy();
      }

      sendPing() {
        return this.selfActor.sendBusMessage('test-message-ping', `ping from B`);
      }

      sendChildPing() {
        return this.childActorC.send('sendPing');
      }
    }

    it('should emit events to local subscribers', function(done) {
      rootActor.getBus().on('test-message', message => {
        expect(message).to.be.equal('hi');
        done();
      });
      rootActor.sendBusMessage('test-message', 'hi');
    });

    it('should broadcast emitted messages to all connected recipients in forked mode from actor A',
      P.coroutine(function*() {
        yield rootActor.createChild(TestActor, { mode: 'forked' });
        rootActor.sendBusMessage('test-message-ping', 'ping from A');

        return messagesExpectationPromise(['pong from B', 'pong from C']);
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked mode from actor B',
      P.coroutine(function*() {
        let childActorB = yield rootActor.createChild(TestActor, { mode: 'forked' });

        yield childActorB.send('sendPing');
        
        return messagesExpectationPromise(['ping from B', 'pong from C']);
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked mode from actor C',
      P.coroutine(function*() {
        let childActorB = yield rootActor.createChild(TestActor, { mode: 'forked' });

        yield childActorB.send('sendChildPing');

        return messagesExpectationPromise(['pong from B', 'ping from C']);
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked clusterized mode',
      P.coroutine(function*() {
        yield rootActor.createChild(TestActor, { mode: 'forked', clusterSize: 3 });
        rootActor.sendBusMessage('test-message-ping', 'ping from A');

        return messagesExpectationPromise([
          'pong from B', 'pong from B', 'pong from B',
          'pong from C', 'pong from C', 'pong from C'
        ]);
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor A',
      P.coroutine(function*() {
        yield rootActor.createChild(TestActor, { mode: 'remote', host: '127.0.0.1' });
        rootActor.sendBusMessage('test-message-ping', 'ping from A');

        return messagesExpectationPromise(['pong from B', 'pong from C']);
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor B',
      P.coroutine(function*() {
        let childActorB = yield rootActor.createChild(TestActor, { mode: 'remote', host: '127.0.0.1' });
        
        yield childActorB.send('sendPing');
        
        return messagesExpectationPromise(['ping from B', 'pong from C']);
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor C',
      P.coroutine(function*() {
        let childActorB = yield rootActor.createChild(TestActor, { mode: 'remote', host: '127.0.0.1' });
        
        yield childActorB.send('sendChildPing');
        
        return messagesExpectationPromise(['pong from B', 'ping from C']);
      })
    );

    it('should not get any messages by bus for particular topic after unsubscribing from it', P.coroutine(function*() {
      let bus = rootActor.getBus();
      let listener = message => {
        throw new Error('Expected no messages from topic test-message-pong, but got one!');
      };

      yield rootActor.createChild(TestActor, { mode: 'forked' });
      bus.on('test-message-pong', listener);
      bus.removeListener('test-message-pong', listener);
      rootActor.sendBusMessage('test-message-ping', 'ping from A');

      return P.delay(3000);
    }));

    it('should not deliver any messages to a destroyed actor', P.coroutine(function*() {
      let childActorB = yield rootActor.createChild(TestActor, { mode: 'forked' });
      
      yield childActorB.sendAndReceive('destroyChild');
      rootActor.sendBusMessage('test-message-ping', 'ping from A');

      return messagesExpectationPromise(['pong from B']);
    }));
  });
});