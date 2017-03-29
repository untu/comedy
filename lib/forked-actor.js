/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var Actor = require('./actor.js');
var net = require('net');
var http = require('http');
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
    super(system, parent, actor.getId(), actor.getName(), actor.getCustomParameters());

    this.system = system;
    this.bus = bus;
    this.actor = actor;
    this.idCounter = 1;
    this.responsePromises = {};
    this.timeouts = [];
    this.timeoutWorkerInterval = setInterval(() => {
      var now = _.now();

      while (this.timeouts.length > 0 && this.timeouts[0].timeout <= now) {
        var timeoutObject = this.timeouts.shift();
        var msgId = timeoutObject.msgId;
        var promise = this.responsePromises[msgId];
        delete this.responsePromises[msgId];

        promise && promise.reject(new Error('Response timed out.'));
      }
    }, 1000);
  }

  initialize() {
    return P.resolve()
      .then(() => this.actor.initialize(this))
      .then(() => {
        // Listen for message responses.
        this.bus.on('message', (msg, handle) => {
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

            var message = this._decodeMessageBody(msg.body, handle);
            var sendPromise;

            if (msg.body.receive) {
              sendPromise = actor.sendAndReceive.apply(actor, [topic].concat(message))
                .then(resp => this._send0({
                  type: 'actor-response',
                  id: msg.id,
                  body: { response: resp }
                }));
            }
            else {
              sendPromise = actor.send.apply(actor, [topic].concat(message));
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
          else if (msg.type == 'actor-response' || msg.type == 'parent-pong') {
            var respPromise = this.responsePromises[msg.id];

            if (respPromise) {
              delete this.responsePromises[msg.id];
            }

            if (!msg.id) return log.warn(`Ignoring "${msg.type}" message with absent ID.`);

            if (!respPromise) return log.warn(`No pending promise for "${msg.type}":`, msg);

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
                log.debug('Destroying forked system for ' + this);

                this.system.destroy().catch(err => {
                  log.error('Failed to destroy forked system: ' + err);
                });
              });
            });
          }
          else if (msg.type == 'actor-destroyed') {
            clearInterval(this.timeoutWorkerInterval);
            var respPromise0 = this.responsePromises[msg.id];

            if (respPromise0) {
              delete this.responsePromises[msg.id];

              respPromise0.resolve();
            }
          }
          else if (msg.type == 'parent-ping') {
            this.bus.send({ type: 'parent-pong', id: msg.id, actorId: this.getId() });
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
   * @param {Array} message Message.
   * @param {Object} options Operation options.
   * - {Boolean} receive Receive flag.
   * - {String} [actorId] ID of a remote actor to send message to (either self or parent).
   * @returns {*} Promise that yields a message response promise, if a receive flag is on. A promise
   * yields undefined if a receive flag is off.
   * @protected
   */
  _sendActorMessage(topic, message, options) {
    var actorMessage = {
      type: 'actor-message',
      body: {
        topic: topic,
        message: message,
        receive: options.receive
      }
    };

    if (message.length == 1 && message[0] instanceof net.Server) {
      if (message[0] instanceof http.Server) {
        actorMessage.body.message = { handleType: 'http.Server' };

        return this._send0(actorMessage, _.extend({}, options, { socketHandle: message[0] }));
      }
      else if (message[0] instanceof net.Server) {
        actorMessage.body.message = { handleType: 'net.Server' };

        return this._send0(actorMessage, _.extend({}, options, { socketHandle: message[0] }));
      }
    }

    var marshalledType = [];
    var message0 = _.map(message || [], (subMessage, idx) => {
      var marshaller = this.system.getMarshallerForMessage(subMessage);

      if (marshaller) {
        marshalledType[idx] = marshaller.type;

        return marshaller.marshall(subMessage);
      }

      return subMessage;
    });

    if (message0.length == 1) {
      message0 = message0[0];
      marshalledType = marshalledType[0];
    }

    actorMessage.body.message = message0;
    actorMessage.body.marshalledType = marshalledType;

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

        // Set message timeout, if needed.
        if (options.timeout > 0) {
          var timeout = _.now() + options.timeout;
          var timeoutObject = { timeout: timeout, msgId: msgId };
          var idx = _.sortedIndex(this.timeouts, timeoutObject, 'timeout');

          this.timeouts.splice(idx, 0, timeoutObject);
        }
      }

      if (this.getLog().isDebug()) {
        this.getLog().debug('Sending message:', JSON.stringify(msg, null, 2));
      }

      var cb = err => {
        if (err) return reject(err);

        resolve(ret);
      };

      if (options.socketHandle) {
        this.bus.send(msg, options.socketHandle, cb);
      }
      else {
        this.bus.send(msg, cb);
      }
    });
  }

  /**
   * Decodes message body, received by this actor.
   *
   * @param {Object} body Message body.
   * @param {Object} [handle] Socket handle object.
   * @returns {Array} Decoded message in variable argument format.
   * @private
   */
  _decodeMessageBody(body, handle) {
    if (handle) {
      switch (body.message.handleType) {
        case 'net.Server':
          return [handle];

        case 'http.Server':
          // Wrap net.Server into http.Server.
          var ret = http.createServer();
          ret.listen(handle);

          return [ret];

        default:
          throw new Error('Unknown handle type: ' + body.message.handleType);
      }
    }

    var message = body.message;
    var marshalledTypes = body.marshalledType;

    if (!message) {
      message = [];
      marshalledTypes = [];
    }

    if (!_.isArray(message)) {
      message = [message];
      marshalledTypes = [marshalledTypes];
    }

    return _.map(message, (subMessage, idx) => {
      var type = marshalledTypes[idx];

      if (type) {
        var marshaller = this.system.getMarshaller(type);

        return marshaller.unmarshall(subMessage);
      }

      return subMessage;
    });
  }
}

module.exports = ForkedActor;