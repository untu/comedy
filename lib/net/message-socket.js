/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let EventEmitter = require('events').EventEmitter;

/**
 * A TCP socket for exchanging Comedy protocol messages.
 */
class MessageSocket extends EventEmitter {
  /**
   * @param {Object} socket Wrapped TCP socket.
   */
  constructor(socket) {
    super();

    this.socket = socket;
    this.messageType = 1;
    this.incomingDataHandler = this._handleIncomingData.bind(this);
  }

  on(eventName, listener) {
    if (eventName == 'message') {
      EventEmitter.prototype.on.apply(this, arguments);

      this.socket.on('data', this.incomingDataHandler);
    }
    else {
      this.socket.on(eventName, listener);
    }
  }

  once(eventName, listener) {
    if (eventName == 'message') {
      EventEmitter.prototype.once.apply(this, arguments);

      // We still need to use 'on', because a message can arrive in several chunks.
      this.socket.on('data', this.incomingDataHandler);
    }
    else {
      this.socket.once(eventName, listener);
    }
  }

  removeListener(eventName, listener) {
    if (eventName == 'message') {
      EventEmitter.prototype.removeListener.apply(this, arguments);

      if (this.listenerCount('message') === 0) {
        this.socket.removeListener('data', this.incomingDataHandler);
      }
    }
    else {
      this.socket.removeListener(eventName, listener);
    }
  }

  removeAllListeners(eventName) {
    if (eventName == 'message') {
      EventEmitter.prototype.removeAllListeners.apply(this, arguments);

      this.socket.removeListener('data', this.incomingDataHandler);
    }
    else {
      this.socket.removeAllListeners(eventName);
    }
  }

  /**
   * Writes message to this socket.
   *
   * @param {Object} message Message data object.
   * @param {Function} [cb] Callback function.
   */
  write(message, cb) {
    this.socket.write(this.makePacket(message), cb);
  }

  /**
   * Alias to write().
   *
   * @param {Object} message Message data object.
   * @param {Function} [cb] Callback function.
   */
  send(message, cb) {
    this.write(message, cb);
  }

  /**
   * Makes a valid network packet, that can be received by remote MessageSocket,
   * from a given message.
   *
   * @param {Object} message Message data object.
   * @returns {Buffer} Resulting network packet.
   */
  makePacket(message) {
    let msgData = JSON.stringify(message);
    let msgBuf = Buffer.alloc(1 + 4 + msgData.length);

    msgBuf.writeUInt8(this.messageType, 0); // JSON message type.
    msgBuf.writeUInt32BE(msgData.length, 1); // Message length.
    msgBuf.write(msgData, 1 + 4);

    return msgBuf;
  }

  /**
   * Closes connection.
   */
  end() {
    this.socket.end();
  }

  /**
   * Destroys the socket.
   */
  destroy() {
    this.socket.destroy();
  }

  /**
   * Handles incoming data.
   *
   * @param {Buffer} data Incoming data chunk.
   * @private
   */
  _handleIncomingData(data) {
    if (this.currentBuffer) {
      data = Buffer.concat([this.currentBuffer, data]);
      delete this.currentBuffer;
    }

    if (data.length < 5) {
      this.currentBuffer = data;

      return; // Wait for more data to form a message.
    }

    let msgType = data.readUInt8();
    let bodyLen = data.readUInt32BE(1);
    let msgLen = 5 + bodyLen;

    if (data.length < msgLen) {
      this.currentBuffer = data;

      return; // Wait for more data to form a message.
    }

    let extraLen = data.length - msgLen;
    let extraData;

    if (extraLen > 0) {
      // Copy next message data.
      extraData = Buffer.alloc(extraLen);
      data.copy(extraData, 0, msgLen);
    }

    if (msgType == this.messageType) {
      try {
        let msgBody = data.toString('utf8', 5, msgLen);
        let msg = JSON.parse(msgBody);

        this.emit('message', msg);
      }
      catch (err) {
        this.socket.emit('error', 'Incoming message parsing failed: ' + err.message);
      }
    }
    else {
      this.socket.emit('error', new Error('Received unexpected message type: ' + msgType));
    }

    if (extraData) {
      this._handleIncomingData(extraData);
    }
  }
}

module.exports = MessageSocket;
module.exports.MessageSocket = MessageSocket;
