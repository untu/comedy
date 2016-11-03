/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var Actor = require('./actor.js');
var P = require('bluebird');
var _ = require('underscore');

/**
 * An actor that is run in separate sub-process on local machine.
 */
class ForkedActor extends Actor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Actor} parent Parent actor.
   * @param {Object} bus Message bus to send/receive messages.
   * @param {Actor} actor Wrapped actor.
   */
  constructor(system, parent, bus, actor) {
    super(system, parent, actor.getId(), actor.getName());

    this.system = system;
    this.bus = bus;
    this.actor = actor;
    this.idCounter = 1;
    this.responsePromises = {};
  }

  initialize() {
    return P.resolve()
      .then(() => this.actor.initialize(this))
      .then(() => {
        // Listen for message responses.
        this.bus.on('message', msg => {
          var log = this.getLog();

          log.debug('Received message:', msg);

          if (!msg.id) return log.warn('Missing ID in actor message (ignoring):', msg);
          
          if (msg.type == 'actor-message') {
            if (!msg.body) return this._sendErrorResponse(msg.id, 'Missing message body');

            var topic = msg.body.topic;

            if (!topic) return this._sendErrorResponse(msg.id, 'Missing message topic');
            
            var actor = this.actor;

            if (msg.actorId != this.getId()) {
              var parent = this.getParent();

              // Check if we've got a message to a parent.
              if (parent && parent.getId() == msg.actorId) {
                actor = parent;
              }
              else {
                return this._sendErrorResponse(msg.id, 'Target actor ID doesn\'t match neither self nor parent');
              }
            }

            var message = msg.body.message;

            if (msg.body.marshalledType) {
              var marshaller = this.system.getMarshaller(msg.body.marshalledType);

              message = marshaller.unmarshall(message);
            }

            var sendPromise;

            if (msg.body.receive) {
              if (_.isArray(message)) {
                sendPromise = actor.sendAndReceive.apply(actor, [topic].concat(message));
              }
              else {
                sendPromise = actor.sendAndReceive(topic, message);
              }

              sendPromise = sendPromise.then(resp => this._send0({
                type: 'actor-response',
                id: msg.id,
                body: { response: resp }
              }));
            }
            else {
              if (_.isArray(message)) {
                sendPromise = actor.send.apply(actor, [topic].concat(message));
              }
              else {
                sendPromise = actor.send(topic, message);
              }
            }

            sendPromise.catch(err => this._sendErrorResponse(msg.id, err.message));
            
            return;
          }

          if (msg.actorId != this.getId()) return;
          
          if (msg.type == 'actor-tree') {
            this.tree()
              .then(tree => this._send0({
                type: 'actor-response',
                id: msg.id,
                body: { response: tree }
              }))
              .catch(err => this._sendErrorResponse(msg.id, err.message));
          }
          else if (msg.type == 'actor-metrics') {
            this.metrics()
              .then(metrics => this._send0({
                type: 'actor-response',
                id: msg.id,
                body: { response: metrics }
              }))
              .catch(err => this._sendErrorResponse(msg.id, err.message));
          }
          else if (msg.type == 'actor-response') {
            var respPromise = this.responsePromises[msg.id];

            if (respPromise) {
              delete this.responsePromises[msg.id];
            }

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
          else if (msg.type == 'destroy-actor') {
            this.bus.removeAllListeners('message');

            this.actor.destroy().then(() => {
              this.bus.send({ type: 'actor-destroyed', actorId: this.getId(), id: msg.id }, () => {
                log.debug('Killing forked process for ' + this);

                process.exit(0);
              });
            });
          }
          else if (msg.type == 'actor-destroyed') {
            var respPromise0 = this.responsePromises[msg.id];

            if (respPromise0) {
              delete this.responsePromises[msg.id];

              respPromise0.resolve();
            }
          }
          else {
            log.warn('Ignoring message of an unknown type:', msg);
          }
        });

        // Remove message listener once child process has exited or crashed.
        this.bus.once('exit', () => {
          this.bus.removeAllListeners('message');
        });
      });
  }

  send0(topic, ...message) {
    return this._sendActorMessage(topic, message, { receive: false });
  }

  sendAndReceive0(topic, ...message) {
    return this._sendActorMessage(topic, message, { receive: true });
  }

  destroy0() {
    var pending = P.pending();
    var msgId = this.idCounter++;

    this.bus.send({
      type: 'destroy-actor',
      actorId: this.getId(),
      id: msgId
    }, err => {
      if (err) return pending.reject(err);

      this.responsePromises[msgId] = pending;
    });

    return pending.promise;
  }

  metrics0() {
    return this.actor.metrics();
  }

  toString() {
    var name = this.getName();

    if (name) {
      return 'ForkedActor(' + this.id + ', ' + name + ')';
    }
    else {
      return 'ForkedActor(' + this.getId() + ')';
    }
  }

  /**
   * @returns {Actor} Wrapped actor.
   * @protected
   */
  _getActor() {
    return this.actor;
  }

  /**
   * Sends an actor message to a forked actor and returns a promise, which is resolved with message response.
   *
   * @param {String} topic Message topic.
   * @param {*} message Message.
   * @param {Object} options Operation options.
   * - {Boolean} receive Receive flag.
   * - {String} [actorId] ID of a remote actor to send message to (either self or parent).
   * @returns {*} Promise that yields a message response promise, if a receive flag is on. A promise
   * yields undefined if a receive flag is off.
   * @protected
   */
  _sendActorMessage(topic, message, options) {
    if (message && message.length == 1) {
      message = message[0];
    }

    var actorMessage = {
      type: 'actor-message',
      body: {
        topic: topic,
        message: message,
        receive: options.receive
      }
    };

    var marshaller = this.system.getMarshallerForMessage(message);

    if (marshaller) {
      actorMessage.body.message = marshaller.marshall(message);
      actorMessage.body.marshalledType = marshaller.type;
    }

    return this._send0(actorMessage, options);
  }

  /**
   * Sends an error response.
   *
   * @param {String} msgId Message ID.
   * @param {String} errorText Error text.
   * @returns {*} Operation promise.
   * @private
   */
  _sendErrorResponse(msgId, errorText) {
    return this._send0({
      type: 'actor-response',
      id: msgId,
      body: {
        error: errorText
      }
    });
  }

  /**
   * Sends an arbitrary message to a forked actor.
   *
   * @param {Object} msg Message to send.
   * @param {Object} [options] Operation options.
   * - {Boolean} receive Receive flag.
   * - {String} [actorId] ID of a remote actor to send message to (either self or parent).
   * @returns {*} Promise that yields a message response promise, if a receive flag is on. A promise
   * yields undefined if a receive flag is off.
   * @protected
   */
  _send0(msg, options) {
    options = options || {};

    return new P((resolve, reject) => {
      var msgId = msg.id;

      if (!msgId) {
        msg.id = msgId = this.idCounter++;
      }

      msg.actorId = options.actorId || this.getId();

      var ret;

      if (options.receive) {
        var pending = P.pending();

        this.responsePromises[msgId] = pending;

        // Await for message response.
        ret = pending.promise;
      }

      if (this.getLog().isDebug()) {
        this.getLog().debug('Sending message:', JSON.stringify(msg, null, 2));
      }

      this.bus.send(msg, err => {
        if (err) return reject(err);

        resolve(ret);
      });
    });
  }
}

module.exports = ForkedActor;