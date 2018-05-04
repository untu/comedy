const actors = require('../index');
const expect = require('chai').expect;
const P = require('bluebird');

let system;
let rootActor;
let rootBus;

describe('SystemBus', function() {
  beforeEach(function() {
    system = actors({ test: true });
    system.listen();

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
      rootBus = rootActor.getSystem().bus;
    });
  });

  afterEach(function() {
    return system.destroy();
  });

  describe('recipients adding/removing', function() {
    it('should admit forked-actor recipients', P.coroutine(function*() {
      yield rootActor
        .createChild({}, { mode: 'forked' })
        .then(() => {
          expect(rootBus.recipients.size).to.be.equal(1);
        });
    }));

    it('should reject wrong type recipients', P.coroutine(function*() {
      yield rootActor
        .createChild({}, { mode: 'in-memory' })
        .then(testActor => {
          rootBus.addRecipient(testActor);
          expect(rootBus.recipients.size).to.be.equal(0);
        });
    }));

    it('should remove recipient by recipient\'s instance ref', P.coroutine(function*() {
      yield rootActor
        .createChild({}, { mode: 'forked' })
        .then(testActor => {
          expect(rootBus.recipients.size).to.be.equal(1);
          rootBus.removeRecipient(testActor);
          expect(rootBus.recipients.size).to.be.equal(0);
        });
    }));
  });

  describe('events emittion', () => {
    /**
     * Actor definition class.
     */
    class TestActor {
      constructor() {
        this.busMessage = '';
      }

      initialize(selfActor) {
        selfActor.getSystem().bus.on('test-message', message => {
          this.busMessage = message;
        });
      }

      getBusMessage() {
        return this.busMessage;
      }
    }

    it('should emit events to local subscribers', function(done) {
      rootBus.on('test-message', message => {
        expect(message).to.be.equal('hi');
        done();
      });
      rootBus.emit('test-message', [], 'hi');
    });

    it('should broadcast emitted messages to all connected recipients in forked mode', P.coroutine(function*() {
      yield rootActor
        .createChild(TestActor, { mode: 'forked' })
        .then(testActor => {
          rootBus.emit('test-message', undefined, 'hi');
          
          return testActor.sendAndReceive('getBusMessage');
        })
        .then(message => expect(message).to.be.equal('hi'));
      
      yield rootActor
        .createChild(TestActor, { mode: 'forked', clusterSize: 3 })
        .then(testActor => {
          rootBus.emit('test-message', undefined, 'hi');
          
          return testActor.broadcastAndReceive('getBusMessage');
        })
        .then(messages => expect(messages.length === 3 && messages.every(msg => msg === 'hi')).to.be.true);
    }));

    it('should broadcast emitted messages to all connected recipients in remote mode', P.coroutine(function*() {
      yield rootActor
        .createChild(TestActor, { mode: 'remote', host: '127.0.0.1' })
        .then(testActor => {
          rootBus.emit('test-message', undefined, 'hi');
          
          return testActor.sendAndReceive('getBusMessage');
        })
        .then(message => expect(message).to.be.equal('hi'));
      
      yield rootActor
        .createChild(TestActor, { mode: 'remote', host: '127.0.0.1', clusterSize: 3 })
        .then(testActor => {
          rootBus.emit('test-message', undefined, 'hi');
          
          return testActor.broadcastAndReceive('getBusMessage');
        })
        .then(messages => expect(messages.length === 3 && messages.every(msg => msg === 'hi')).to.be.true);
    }));
  });
});