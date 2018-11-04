/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

/**
 * Adapts worker thread port communication facility to ForkedActor bus interface.
 */
class WorkerThreadBusAdapter {
  /**
   * @param {Object} port Communication port for sending and receiving messages.
   */
  constructor(port) {
    this.port = port;
  }

  /**
   * Sends message to this bus.
   *
   * @param {Object} msg Message to send.
   * @param {Function} cb Callback function, that is called when
   * a message is successfully sent.
   */
  send(msg, cb) {
    this.port.postMessage(msg);
    cb();
  }

  /**
   * Subscribes to events on this bus to possibly receive messages.
   *
   * @param {String} eventName Event name.
   * @param {Function} cb Event callback function.
   */
  on(eventName, cb) {
    this.port.on(eventName, cb);
  }

  /**
   * Unsubscribes from given event.
   *
   * @param {String} eventName Event name.
   * @param {Function} cb Callback function.
   */
  off(eventName, cb) {
    this.port.off(eventName, cb);
  }

  /**
   * Subscribes to single message on a given event.
   *
   * @param {String} eventName Event name.
   * @param {Function} cb Event callback function.
   */
  once(eventName, cb) {
    this.port.once(eventName, cb);
  }

  /**
   * Removes all subscriptions for a given event or all events.
   *
   * @param {String} [eventName] Event name.
   */
  removeAllListeners(eventName) {
    this.port.removeAllListeners(eventName);
  }
}

module.exports = WorkerThreadBusAdapter;