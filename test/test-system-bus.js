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
          if (message !== 'ping from B') {
            this.selfActor.sendBusMessage('test-message-pong', `pong from ${selfActor.customParameters.name}`);
          }
        });  

        /**
         * Actor forked/remote child.
         */
        class TestActorChild {
          initialize(selfActor) {
            this.selfActor = selfActor;

            this.selfActor.getBus().on('test-message-ping', message => {
              if (message !== 'ping from C') {
                this.selfActor.sendBusMessage('test-message-pong', `pong from ${selfActor.customParameters.name}`);
              }
            }); 
          }

          sendPing() {
            this.selfActor.sendBusMessage('test-message-ping', `ping from ${this.selfActor.customParameters.name}`);
          }
        }

        return this.selfActor
          .createChild(TestActorChild, {
            mode: this.selfActor.getMode(),
            host: '127.0.0.1',
            customParameters: { name: 'C' }
          })
          .then(childActorC => {
            this.childActorC = childActorC;
          });
      }

      destroyChild() {
        return this.childActorC.destroy();
      }

      sendPing() {
        return this.selfActor.sendBusMessage('test-message-ping', `ping from ${this.selfActor.customParameters.name}`);
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
          .createChild(TestActor, { mode: 'forked', customParameters: { name: 'B' } })
          .then(() => {
            rootActor.sendBusMessage('test-message-ping', 'ping from A');

            return messagesExpectationPromise();
          })
          .then(
            messages => {
              expect(messages.length).to.be.equal(2);
              expect(messages).to.include('pong from B');
              expect(messages).to.include('pong from C');
            },
            error => {
              throw new Error(error);
            });
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked mode from actor B',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'forked', customParameters: { name: 'B' } })
          .then(childActorB => {
            childActorB.send('sendPing');
            
            return messagesExpectationPromise();
          })
          .then(
            messages => {
              expect(messages.length).to.be.equal(2);
              expect(messages).to.include('ping from B');
              expect(messages).to.include('pong from C');
            },
            error => { throw error; });
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked mode from actor C',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'forked', customParameters: { name: 'B' } })
          .then(childActorB => {
            childActorB.send('sendChildPing');
            
            return messagesExpectationPromise();
          })
          .then(
            messages => {
              expect(messages.length).to.be.equal(2);
              expect(messages).to.include('pong from B');
              expect(messages).to.include('ping from C');
            },
            error => { throw error; });
      })
    );

    it('should broadcast emitted messages to all connected recipients in forked clusterized mode',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'forked', clusterSize: 3, customParameters: { name: 'B' } })
          .then(testActor => {
            rootActor.sendBusMessage('test-message-ping', 'ping from A');

            return messagesExpectationPromise();
          })
          .then(messages => expect(messages.length).to.be.equal(6) &&
            expect(messages.filter(msg => msg === 'pong from B').length).to.be.equal(3) &&
            expect(messages.filter(msg => msg === 'pong from C').length).to.be.equal(3),
          error => { throw new Error(error); });
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor A',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'remote', host: '127.0.0.1', customParameters: { name: 'B' } })
          .then(childActorB => {
            rootActor.sendBusMessage('test-message-ping', 'ping from A');

            return messagesExpectationPromise();
          })
          .then(messages => expect(messages.length).to.be.equal(2) &&
            expect(messages).to.include('pong from B') &&
            expect(messages).to.include('pong from C'),
          error => { throw new Error(error); });
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor B',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'remote', host: '127.0.0.1', customParameters: { name: 'B' } })
          .then(childActorB => {
            childActorB.send('sendPing');
            
            return messagesExpectationPromise();
          })
          .then(messages => expect(messages.length).to.be.equal(2) &&
            expect(messages).to.include('ping from B') &&
            expect(messages).to.include('pong from C'),
          error => { throw error; });
      })
    );

    it('should broadcast emitted messages to all connected recipients in remote mode from actor C',
      P.coroutine(function*() {
        yield rootActor
          .createChild(TestActor, { mode: 'remote', host: '127.0.0.1', customParameters: { name: 'B' } })
          .then(childActorB => {
            childActorB.send('sendChildPing');
            
            return messagesExpectationPromise();
          })
          .then(messages => expect(messages.length).to.be.equal(2) &&
            expect(messages).to.include('pong from B') &&
            expect(messages).to.include('ping from C'),
          error => { throw error; });
      })
    );

    it('should not get any messages by bus for particular topic after unsubscribed from it', P.coroutine(function*() {
      yield rootActor
        .createChild(TestActor, { mode: 'forked', customParameters: { name: 'B' } })
        .then(childActorB => {
          rootActor.sendBusMessage('test-message-ping', 'ping from A');

          return new Promise((resolve, reject) => {
            let messages = [];
            const bus = rootActor.getBus();
            const listener = message => {
              reject('Expected no messages from topic test-message-pong, but got one!');
            };

            setTimeout(() => {
              resolve(messages);
            }, 3000);

            bus.on('test-message-pong', listener);
            bus.removeListener('test-message-pong', listener);
          });
        })
        .then(messages => expect(messages.length).to.be.equal(0), error => { throw new Error(error); });
    }));

    it('should not deliver any messages to a destroyed actor', P.coroutine(function*() {
      yield rootActor
        .createChild(TestActor, { mode: 'forked', customParameters: { name: 'B' } })
        .then(childActorB => {
          childActorB.send('destroyChild');
          
          return P.delay(3000)
            .then(() => {
              rootActor.sendBusMessage('test-message-ping', 'ping from A');

              return messagesExpectationPromise();
            });
        })
        .then(messages => expect(messages).to.be.eql(['pong from B']), error => { throw new Error(error); });
    }));
  });
});