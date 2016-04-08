'use strict';

var Actor = require('./actor.js');
var log = require('../utils/log.js');
var P = require('bluebird');

/**
 * An actor that is run in separate sub-process on local machine.
 */
class ForkedActor extends Actor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Object} bus Message bus to send/receive messages.
   */
  constructor(system, bus) {
    super(system);

    this.bus = bus;
    this.idCounter = 1;
    this.responsePromises = {};

    // Listen for message responses.
    bus.on('message', (msg) => {
      if (msg.type != 'actor-response') return log.warn('Ignoring message of an unknown type:', msg);

      if (!msg.id) return log.warn('Ignoring "actor-response" message with absent ID.');

      var respPromise = this.responsePromises[msg.id];

      if (!respPromise) return log.warn('No pending promise for "actor-response":', msg);

      delete this.responsePromises[msg.id];

      if (msg.error) {
        respPromise.reject(new Error(msg.error));
      }
      else {
        respPromise.resolve(msg.body && msg.body.result);
      }
    });
  }

  send(topic, message) {
    return this._send0(topic, message).return(undefined);
  }

  sendAndReceive(topic, message) {
    return this._send0(topic, message)
      .then(msgId => {
        var pending = P.pending();

        this.responsePromises[msgId] = pending;

        // Await for message response.
        return pending.promise;
      });
  }

  /**
   * Sends a message and returns a promise, which is resolved with sent message ID.
   *
   * @param {String} topic Message topic.
   * @param message Message.
   * @returns {*} Promise that yields a sent message ID.
   * @private
   */
  _send0(topic, message) {
    return new P((resolve, reject) => {
      var msgId = this.idCounter++;
      var msg0 = {
        type: 'actor-message',
        id: msgId,
        body: {
          topic: topic,
          message: message
        }
      };

      this.bus.send(msg0, err => {
        if (err) return reject(err);

        resolve(msgId);
      });
    });
  }
}

module.exports = ForkedActor;