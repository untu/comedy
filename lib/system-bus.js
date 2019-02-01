/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

const EventEmitter = require('events');
const { Logger } = require('./utils/logger');

/**
 * Bus for broadcasting system-level messages across all actors.
 */
class SystemBus extends EventEmitter {
  /**
   * @param {Object} [options={}] Startup options.
   */
  constructor(options = {}) {
    super();
    this.setMaxListeners(50);
    this.log = options.log || new Logger();
    this.recipients = new Set();
  }

  /**
   * Decorates EventEmitter's emit method with additional logic.
   *
   * @param {String} event Event name.
   * @param {any} args Emission arguments.
   */
  emit(event, ...args) {
    this._broadcastToForkedRecipients(event, [], ...args);
    super.emit(event, ...args);
  }

  /**
   * Emits event from an actor. This is an internal helper method.
   *
   * @param {String} event Event name.
   * @param {String[]} [senders=[]] Chain of actors (ID's) who sent that message.
   * @param {any} args Emission arguments.
   */
  emitFromActor(event, senders = [], ...args) {
    this._broadcastToForkedRecipients(event, senders, ...args);
    super.emit(event, ...args);
  }

  /**
   * Adds forked recipient actor.
   *
   * @param {ForkedActor} recipient Actor receiving messages.
   */
  addForkedRecipient(recipient) {
    if (!['forked', 'remote', 'threaded'].includes(recipient.getMode())) {
      this.log.error(`Trying to add invalid recipient to the system's bus: ${recipient}`);

      return;
    }

    this.recipients.add(recipient);
  }

  /**
   * Removes forked recipient actor.
   *
   * @param {ForkedActor} recipient Actor receiving messages.
   */
  removeForkedRecipient(recipient) {
    this.recipients.delete(recipient);
  }

  /**
   * Broadcasts event data to forked and remote systems.
   *
   * @param {String} event Event name.
   * @param {String[]} [senders=[]] Chain of actors (ID's) who sent that message.
   * @param {*} args Emission arguments.
   */
  _broadcastToForkedRecipients(event, senders = [], ...args) {
    this.recipients.forEach(recipient => {
      if (!senders.includes(recipient.getId())) {
        recipient.transmitBusMessage(event, senders, ...args);
      }
    });
  }
}

module.exports = SystemBus;