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
      var respPromise = this.responsePromises[msg.id];

      if (respPromise) {
        delete this.responsePromises[msg.id];
      }

      if (msg.type == 'actor-response') {
        if (!msg.id) return log.warn('Ignoring "actor-response" message with absent ID.');

        if (!respPromise) return log.warn('No pending promise for "actor-response":', msg);

        if (msg.body) {
          var body = msg.body;

          if (body.error) {
            respPromise.reject(new Error(body.error));
          }
          else {
            respPromise.resolve(body.response);
          }
        }
        else {
          respPromise.resolve();
        }
      }
      else if (msg.type == 'actor-destroyed') {
        respPromise && respPromise.resolve();
      }
      else {
        log.warn('Ignoring message of an unknown type:', msg);
      }
    });
  }

  send(topic, message) {
    return this._send0(topic, message, false).return(undefined);
  }

  sendAndReceive(topic, message) {
    return this._send0(topic, message, true)
      .then(msgId => {
        var pending = P.pending();

        this.responsePromises[msgId] = pending;

        // Await for message response.
        return pending.promise;
      });
  }

  destroy() {
    var pending = P.pending();
    var msgId = this.idCounter++;

    this.bus.send({
      type: 'destroy-actor',
      id: msgId
    }, err => {
      if (err) return pending.reject(err);

      this.responsePromises[msgId] = pending;
    });

    return pending.promise;
  }

  /**
   * Sends a message and returns a promise, which is resolved with sent message ID.
   *
   * @param {String} topic Message topic.
   * @param message Message.
   * @param {Boolean} receive Receive flag.
   * @returns {*} Promise that yields a sent message ID.
   * @private
   */
  _send0(topic, message, receive) {
    return new P((resolve, reject) => {
      var msgId = this.idCounter++;
      var msg0 = {
        type: 'actor-message',
        id: msgId,
        body: {
          topic: topic,
          message: message,
          receive: receive
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