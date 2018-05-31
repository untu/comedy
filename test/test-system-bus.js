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
    const messagesExpectationPromise = () => {
      return new Promise((resolve, reject) => {
        let messages = [];
        const bus = rootActor.getBus();

        setTimeout(() => {
          resolve(messages);
        }, 3000);

        bus.on('test-message-ping', message => {
          messages.push(message);
        });

        bus.on('test-message-pong', message => {
          messages.push(message);
        });
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

            return messagesExpectationPromise();
          })
          .then(messages => {
            expect(messages.length).to.be.equal(2);
            expect(messages).to.include('pong from B');
            expect(messages).to.include('pong from C');
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked mode from actor B',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'forked' })
          .then(childActorB => {
            return childActorB.send('sendPing').then(() => {
              return messagesExpectationPromise();
            });
          })
          .then(messages => {
            expect(messages.length).to.be.equal(2);
            expect(messages).to.include('ping from B');
            expect(messages).to.include('pong from C');
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked mode from actor C',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'forked' })
          .then(childActorB => {
            return childActorB.send('sendChildPing').then(() => {
              return messagesExpectationPromise();
            });
          })
          .then(messages => {
            expect(messages.length).to.be.equal(2);
            expect(messages).to.include('pong from B');
            expect(messages).to.include('ping from C');
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked clusterized mode',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'forked', clusterSize: 3 })
          .then(testActor => {
            rootActor.sendBusMessage('test-message-ping', 'ping from A');

            return messagesExpectationPromise();
          })
          .then(messages => {
            expect(messages.length).to.be.equal(6);
            expect(messages.filter(msg => msg === 'pong from B').length).to.be.equal(3);
            expect(messages.filter(msg => msg === 'pong from C').length).to.be.equal(3);
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor A',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'remote', host: '127.0.0.1' })
          .then(childActorB => {
            rootActor.sendBusMessage('test-message-ping', 'ping from A');

            return messagesExpectationPromise();
          })
          .then(messages => {
            expect(messages.length).to.be.equal(2);
            expect(messages).to.include('pong from B');
            expect(messages).to.include('pong from C');
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor B',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'remote', host: '127.0.0.1' })
          .then(childActorB => {
            return childActorB.send('sendPing').then(() => {
              return messagesExpectationPromise();
            });
          })
          .then(messages => {
            expect(messages.length).to.be.equal(2);
            expect(messages).to.include('ping from B');
            expect(messages).to.include('pong from C');
          });
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor C',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'remote', host: '127.0.0.1' })
          .then(childActorB => {
            return childActorB.send('sendChildPing').then(() => {
              return messagesExpectationPromise();
            });
          })
          .then(messages => {
            expect(messages.length).to.be.equal(2);
            expect(messages).to.include('pong from B');
            expect(messages).to.include('ping from C');
          });
      })
    );

    it('should not get any messages by bus for particular topic after unsubscribing from it', P.coroutine(function*() {
      yield rootActor
        .createChild(TestActor, { mode: 'forked' })
        .then(childActorB => {
          const bus = rootActor.getBus();
          const listener = message => {
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
          childActorB.send('destroyChild');

          return P.delay(3000)
            .then(() => {
              rootActor.sendBusMessage('test-message-ping', 'ping from A');

              return messagesExpectationPromise();
            });
        })
        .then(messages => expect(messages).to.be.eql(['pong from B']));
    }));
  });
});