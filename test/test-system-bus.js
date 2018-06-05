const actors = require('../index');
const expect = require('chai').expect;
const P = require('bluebird');

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
        var bus = rootActor.getBus();
        var handler = message => {
          var index = expectedMessages.findIndex(value => value === message);

          if (!~index) {
            reject(`Received unexpected message '${message}'`);
          }

          expectedMessages.splice(index, 1);

          if (!expectedMessages.length) {
            resolve();
          }

          setTimeout(() => {
            reject('Test timeout expired.');
          }, 5000);
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
        yield rootActor
          .createChild(TestActor, { mode: 'forked' })
          .then(() => {
            rootActor.sendBusMessage('test-message-ping', 'ping from A');

            return messagesExpectationPromise(['pong from B', 'pong from C']);
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked mode from actor B',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'forked' })
          .then(childActorB => {
            return childActorB.send('sendPing').then(() => {
              return messagesExpectationPromise(['ping from B', 'pong from C']);
            });
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked mode from actor C',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'forked' })
          .then(childActorB => {
            return childActorB.send('sendChildPing').then(() => {
              return messagesExpectationPromise(['pong from B', 'ping from C']);
            });
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked clusterized mode',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'forked', clusterSize: 3 })
          .then(testActor => {
            rootActor.sendBusMessage('test-message-ping', 'ping from A');

            return messagesExpectationPromise(['pong from B', 'pong from B', 'pong from B',
              'pong from C', 'pong from C', 'pong from C']);
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor A',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'remote', host: '127.0.0.1' })
          .then(childActorB => {
            rootActor.sendBusMessage('test-message-ping', 'ping from A');

            return messagesExpectationPromise(['pong from B', 'pong from C']);
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor B',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'remote', host: '127.0.0.1' })
          .then(childActorB => {
            return childActorB.send('sendPing').then(() => {
              return messagesExpectationPromise(['ping from B', 'pong from C']);
            });
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor C',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'remote', host: '127.0.0.1' })
          .then(childActorB => {
            return childActorB.send('sendChildPing').then(() => {
              return messagesExpectationPromise(['pong from B', 'ping from C']);
            });
          });
      })
    );

    it('should not get any messages by bus for particular topic after unsubscribing from it', P.coroutine(function*() {
      yield rootActor
        .createChild(TestActor, { mode: 'forked' })
        .then(childActorB => {
          var bus = rootActor.getBus();
          var listener = message => {
            throw new Error('Expected no messages from topic test-message-pong, but got one!');
          };

          bus.on('test-message-pong', listener); 
          bus.removeListener('test-message-pong', listener);
          rootActor.sendBusMessage('test-message-ping', 'ping from A');

          return new Promise((resolve, reject) => {
            setTimeout(() => {
              resolve();
            }, 3000);
          });
        });
    }));

    it('should not deliver any messages to a destroyed actor', P.coroutine(function*() {
      yield rootActor
        .createChild(TestActor, { mode: 'forked' })
        .then(childActorB => {
          return childActorB.sendAndReceive('destroyChild')
            .then(() => {
              rootActor.sendBusMessage('test-message-ping', 'ping from A');

              return messagesExpectationPromise(['pong from B']);
            });
        });
    }));
  });
});