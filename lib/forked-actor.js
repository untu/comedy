/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let Actor = require('./actor.js');
let ClientActorProxy = require('./client-actor-proxy.js');
let net = require('net');
let http = require('http');
let P = require('bluebird');
let _ = require('underscore');

/**
 * An actor that is run in separate sub-process on local machine.
 */
class ForkedActor extends Actor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Actor} parent Parent actor.
   * - {Object} definition Actor behaviour definition.
   * - {Object} [config] Actor configuration.
   * - {Object} [bus] Message bus to send/receive messages.
   * - {Actor} actor Wrapped actor.
   */
  constructor(options) {
    super({
      system: options.system,
      parent: options.parent,
      definition: options.definition,
      id: options.actor.getId(),
      name: options.actor.getName(),
      config: options.config
    });

    this.system = options.system;
    this.bus = options.bus;
    this.actor = options.actor;
    this.idCounter = 1;
    this.responsePromises = {};
    this.timeouts = [];
    this.timeoutWorkerInterval = setInterval(() => {
      let now = _.now();

      while (this.timeouts.length > 0 && this.timeouts[0].timeout <= now) {
        let timeoutObject = this.timeouts.shift();
        let msgId = timeoutObject.msgId;
        let promise = this.responsePromises[msgId];
        delete this.responsePromises[msgId];

        promise && promise.reject(new Error('Response timed out.'));
      }
    }, 1000);
  }

  initialize() {
    return P.resolve()
      .then(() => this.actor.initialize(this))
      .then(() => {
        if (!this.bus) throw new Error('No bus specified for actor: ' + this);

        if (!this.listening) {
          this._setBus(this.bus);
        }

        this._setState('ready');
      });
  }

  getMode() {
    return 'forked';
  }

  getCustomParameters() {
    return this.actor.getCustomParameters();
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

  /**
   * Transmits bus message through this actor's system bus instance.
   *
   * @param {String} event Event name.
   * @param {String[]} senders Chain of actors (ID's) who sent that message.
   * @param {any} args Emission arguments.
   */
  transmitBusMessage(event, senders = [], ...args) {
    if (['destroyed', 'destroying', 'crashed'].includes(this.getState())) return;

    if (!this.hasParent()) {
      this.getBus().emitFromActor(event, senders.concat(this.getId()), ...args);
    }

    this._send0({ type: 'system-bus-message', event, senders: senders.concat(this.getId()), args });
  }

  toString() {
    let name = this.getName();

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
   * Sets message bus to this actor and listens to the messages from this bus.
   *
   * @param {Object} bus Message bus.
   * @protected
   */
  _setBus(bus) {
    this.bus = bus;
    this.listening = true;

    // Listen for message responses.
    this.bus.on('message', (msg, handle) => {
      this.lastReceiveTimestamp = _.now();
      let log = this.getLog();

      log.debug('Received message:', msg);

      if (!msg.id) return log.warn('Missing ID in actor message (ignoring):', msg);

      if (msg.type == 'actor-message') {
        if (!msg.body) return this._sendErrorResponse(msg.id, 'Missing message body');

        let topic = msg.body.topic;

        if (!topic) return this._sendErrorResponse(msg.id, 'Missing message topic');

        let actor = this.actor;

        if (msg.actorId != this.getId()) {
          let parent = this.getParent();

          // Check if we've got a message to a parent.
          if (parent && parent.getId() == msg.actorId) {
            actor = parent;
          }
          else {
            return this._sendErrorResponse(msg.id, 'Target actor ID doesn\'t match neither self nor parent');
          }
        }

        this._decodeMessageBody(msg.body, handle)
          .then(message => {
            if (msg.body.receive) {
              return actor.sendAndReceive.apply(actor, [topic].concat(message))
                .then(resp => this._send0({
                  type: 'actor-response',
                  id: msg.id,
                  body: { response: resp }
                }));
            }
            else {
              return actor.send.apply(actor, [topic].concat(message));
            }
          })
          .catch(err => this._sendErrorResponse(msg.id, err.message));

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
        let respPromise = this.responsePromises[msg.id];

        if (respPromise) {
          delete this.responsePromises[msg.id];
        }

        if (!msg.id) return log.warn(`Ignoring "${msg.type}" message with absent ID.`);

        if (!respPromise) return log.warn(`No pending promise for "${msg.type}":`, msg);

        if (msg.body) {
          let body = msg.body;

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
        this.actor.destroy().then(() => {
          this._send0({ type: 'actor-destroyed', id: msg.id });
        });
      }
      else if (msg.type == 'actor-destroyed') {
        clearInterval(this.timeoutWorkerInterval);
        let respPromise0 = this.responsePromises[msg.id];

        if (respPromise0) {
          delete this.responsePromises[msg.id];

          respPromise0.resolve();
        }

        this._send0({ type: 'actor-destroyed-ack' });
      }
      else if (msg.type == 'actor-destroyed-ack') {
        this.bus.removeAllListeners('message');

        log.debug('Destroying forked system for ' + this);

        this.system.destroy().catch(err => {
          log.error('Failed to destroy forked system: ' + err);
        });
      }
      else if (msg.type == 'parent-ping') {
        this._send0({ type: 'parent-pong', id: msg.id });
      }
      else if (msg.type == 'system-bus-message') {
        if (this.hasParent() &&
          !msg.senders.includes(this.getParent().getId()) &&
          ['forked', 'remote'].includes(this.getParent().getMode())
        ) {
          // NOTE: If this actor's id is not in the msg.senders list then this message was sent by its child through
          // the parent-child communication bus. New submittion must be initiated on the parent to notify its parent
          // about the message it recieved.
          this.getParent().actor.transmitBusMessage(msg.event, msg.senders, ...msg.args);
        }
        else {
          this.getBus().emitFromActor(msg.event, msg.senders, ...msg.args);
        }
      }
      else if (msg.type == 'child-config-change') {
        this.changeGlobalConfigurationForChildren(msg.body.config)
          .then(() => this._send0({
            type: 'actor-response',
            id: msg.id
          }))
          .catch(err => this._sendErrorResponse(msg.id, err.message));
      }
      else {
        log.warn('Ignoring message of an unknown type:', msg);
      }
    });

    // Remove message listener once child process has exited or crashed.
    this.bus.once('exit', () => {
      this.bus.removeAllListeners('message');
    });
  }

  _setState(state) {
    super._setState(state);

    if (state == 'crashed') {
      // Reject all pending response promises.
      _.each(this.responsePromises, promise => {
        promise && promise.reject(new Error('Actor crashed.'));
      });

      this.responsePromises = {};
      this.timeouts = [];
    }
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
    let actorMessage = {
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

    let marshalledTypes = [];

    return P
      .map(message || [], (subMessage, idx) => {
        let marshaller;

        if (subMessage instanceof ClientActorProxy) {
          subMessage = subMessage.getWrapped();
        }

        if (subMessage instanceof Actor) {
          marshaller = this._getReferenceMarshaller();
        }
        else {
          marshaller = this.system.getMarshallerForMessage(subMessage);
        }

        if (marshaller) {
          marshalledTypes[idx] = marshaller.type;

          return marshaller.marshall(subMessage);
        }

        return subMessage;
      })
      .then(messageParts => {
        if (messageParts.length == 1) {
          messageParts = messageParts[0];
          marshalledTypes = marshalledTypes[0];
        }

        actorMessage.body.message = messageParts;
        actorMessage.body.marshalledType = marshalledTypes;

        return this._send0(actorMessage, options);
      });
  }

  /**
   * @returns {ForkedActorReferenceMarshaller} Reference marshaller.
   * @protected
   */
  _getReferenceMarshaller() {
    return this.system.getForkedActorReferenceMarshaller();
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
  _send0(msg, options = {}) {
    return new P((resolve, reject) => {
      let msgId = msg.id;

      if (!msgId) {
        msg.id = msgId = this.idCounter++;
      }

      msg.actorId = options.actorId || this.getId();

      let ret;

      if (options.receive) {
        let pending = {};
        let promise = new P((resolve, reject) => {
          pending = { resolve, reject };
        });

        this.responsePromises[msgId] = pending;

        // Await for message response.
        ret = promise;

        // Set message timeout, if needed.
        if (options.timeout > 0) {
          let timeout = _.now() + options.timeout;
          let timeoutObject = { timeout: timeout, msgId: msgId };
          let idx = _.sortedIndex(this.timeouts, timeoutObject, 'timeout');

          this.timeouts.splice(idx, 0, timeoutObject);
        }
      }

      if (this.getLog().isDebug()) {
        this.getLog().debug('Sending message:', msg);
      }

      let cb = err => {
        if (err) {
          delete this.responsePromises[msgId];

          return reject(err);
        }

        if (ret) {
          ret.then(resolve).catch(reject);
        }
        else {
          resolve();
        }
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
   * @returns {Promise} Promise of decoded message in variable argument format.
   * @private
   */
  _decodeMessageBody(body, handle) {
    if (handle) {
      switch (body.message.handleType) {
        case 'net.Server':
          return P.resolve([handle]);

        case 'http.Server': {
          // Wrap net.Server into http.Server.
          let ret = http.createServer();
          ret.listen(handle);

          return P.resolve([ret]);
        }

        default:
          return P.reject(new Error('Unknown handle type: ' + body.message.handleType));
      }
    }

    let message = body.message;
    let marshalledTypes = body.marshalledType;

    if (_.isUndefined(message)) {
      message = [];
      marshalledTypes = [];
    }

    if (!_.isArray(message)) {
      message = [message];
      marshalledTypes = [marshalledTypes];
    }

    return P.map(message, (subMessage, idx) => {
      let type = marshalledTypes[idx];

      if (type) {
        let marshaller;

        if (type == 'InterProcessReference') {
          marshaller = this.system.getForkedActorReferenceMarshaller();
        }
        else if (type == 'InterHostReference') {
          marshaller = this.system.getRemoteActorReferenceMarshaller();
        }
        else {
          marshaller = this.system.getMarshaller(type);
        }

        return marshaller.unmarshall(subMessage);
      }

      return subMessage;
    });
  }

  /**
   * Returns a timestamp of last receipt of a packet from child endpoint.
   *
   * @returns {Number|undefined} Last child packet timestamp or undefined, if no
   * packet was yet received.
   * @protected
   */
  _getLastReceiveTimestamp() {
    return this.lastReceiveTimestamp;
  }
}

module.exports = ForkedActor;
