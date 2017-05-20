/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var EventEmitter = require('events').EventEmitter;

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
  }

  on(eventName, listener) {
    this.socket.on(eventName, listener);
  }

  once(eventName, listener) {
    this.socket.once(eventName, listener);
  }

  removeListener(eventName, listener) {
    this.socket.removeListener(eventName, listener);
  }

  removeAllListeners(eventName) {
    this.socket.removeAllListeners(eventName);
  }

  /**
   * Writes message to this socket.
   *
   * @param {Object} message Message data object.
   * @param {Function} [cb] Callback function.
   */
  write(message, cb) {
    var msgData = JSON.stringify(message);
    var msgBuf = Buffer.alloc(1 + 4 + msgData.length);

    msgBuf.writeUInt8(this.messageType, 0); // JSON message type.
    msgBuf.writeUInt32BE(msgData.length, 1); // Message length.
    msgBuf.write(msgData, 1 + 4);

    this.socket.write(msgBuf, cb);
  }

  /**
   * Closes connection.
   */
  end() {
    this.socket.end();
  }
}

module.exports = MessageSocket;