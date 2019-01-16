/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

import * as actors from '../../';
import {expect} from 'chai';
import {Actor, ActorRef, ActorSystem} from '../../index';
import P = require('bluebird');
import {describe, afterEach, beforeEach, it} from 'mocha';

let system: ActorSystem;
let rootActor: Actor;

describe('SystemBus', function() {
  beforeEach(async function() {
    system = actors.createSystem({ test: true });

    await system.listen();

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  afterEach(function() {
    return system.destroy();
  });

  describe('Event generation', () => {
    const messagesExpectationPromise = (expectedMessages: any[]) => {
      return new Promise((resolve, reject) => {
        let bus = rootActor.getBus();
        let handler = (message: any) => {
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
      private selfActor: Actor;
      private childActorC: ActorRef;

      initialize(selfActor: Actor) {
        this.selfActor = selfActor;
        this.selfActor.getBus().on('test-message-ping', message => {
          if (message !== 'ping from B') { // To avoid message receiving by clustered siblings.
            this.selfActor.getBus().emit('test-message-pong', `pong from B`);
          }
        });

        /**
         * Actor forked/remote child.
         */
        class TestActorChild {
          private selfActor: Actor;

          initialize(selfActor: Actor) {
            this.selfActor = selfActor;

            this.selfActor.getBus().on('test-message-ping', message => {
              if (message !== 'ping from C') { // To avoid message receiving by clustered siblings.
                this.selfActor.getBus().emit('test-message-pong', `pong from C`);
              }
            });
          }

          sendPing() {
            this.selfActor.getBus().emit('test-message-ping', `ping from C`);
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
        return this.selfActor.getBus().emit('test-message-ping', `ping from B`);
      }

      sendChildPing() {
        return this.childActorC.send('sendPing');
      }
    }

    it('should emit events to local subscribers', done => {
      rootActor.getBus().on('test-message', message => {
        expect(message).to.be.equal('hi');
        done();
      });
      rootActor.getBus().emit('test-message', 'hi');
    });

    it('should emit events to local subscribers via actor system', done => {
      rootActor.getBus().on('test-message', message => {
        expect(message).to.be.equal('hi');
        done();
      });
      system.getBus().emit('test-message', 'hi');
    });

    it('should broadcast emitted messages to all connected recipients in forked mode from actor A', async () => {
      await rootActor.createChild(TestActor, { mode: 'forked' });
      rootActor.getBus().emit('test-message-ping', 'ping from A');

      return messagesExpectationPromise(['pong from B', 'pong from C']);
    });

    it('should broadcast emitted messages to all connected recipients in forked mode from actor B', async () => {
      let childActorB = await rootActor.createChild(TestActor, { mode: 'forked' });

      await childActorB.send('sendPing');

      return messagesExpectationPromise(['ping from B', 'pong from C']);
    });

    it('should broadcast emitted messages to all connected recipients in forked mode from actor C', async () => {
      let childActorB = await rootActor.createChild(TestActor, { mode: 'forked' });

      await childActorB.send('sendChildPing');

      return messagesExpectationPromise(['pong from B', 'ping from C']);
    });

    it('should broadcast emitted messages to all connected recipients in forked clusterized mode', async () => {
      await rootActor.createChild(TestActor, { mode: 'forked', clusterSize: 3 });
      rootActor.getBus().emit('test-message-ping', 'ping from A');

      return messagesExpectationPromise([
        'pong from B', 'pong from B', 'pong from B',
        'pong from C', 'pong from C', 'pong from C'
      ]);
    });

    it('should broadcast emitted messages to all connected recipients in remote mode from actor A', async () => {
      await rootActor.createChild(TestActor, { mode: 'remote', host: '127.0.0.1' });
      rootActor.getBus().emit('test-message-ping', 'ping from A');

      return messagesExpectationPromise(['pong from B', 'pong from C']);
    });

    it('should broadcast emitted messages to all connected recipients in remote mode from actor B', async () => {
      let childActorB = await rootActor.createChild(TestActor, { mode: 'remote', host: '127.0.0.1' });

      await childActorB.send('sendPing');

      return messagesExpectationPromise(['ping from B', 'pong from C']);
    });

    it('should broadcast emitted messages to all connected recipients in remote mode from actor C', async () => {
      let childActorB = await rootActor.createChild(TestActor, { mode: 'remote', host: '127.0.0.1' });

      await childActorB.send('sendChildPing');

      return messagesExpectationPromise(['pong from B', 'ping from C']);
    });

    it('should not get any messages by bus for particular topic after unsubscribing from it', async () => {
      let bus = rootActor.getBus();
      let listener = (message: any) => {
        throw new Error('Expected no messages from topic test-message-pong, but got one!');
      };

      await rootActor.createChild(TestActor, { mode: 'forked' });
      bus.on('test-message-pong', listener);
      bus.removeListener('test-message-pong', listener);
      rootActor.getBus().emit('test-message-ping', 'ping from A');

      return P.delay(3000);
    });

    it('should not deliver any messages to a destroyed actor', async () => {
      let childActorB = await rootActor.createChild(TestActor, { mode: 'forked' });

      await childActorB.sendAndReceive('destroyChild');
      rootActor.getBus().emit('test-message-ping', 'ping from A');

      return messagesExpectationPromise(['pong from B']);
    });
  });
});