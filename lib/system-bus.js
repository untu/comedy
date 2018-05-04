const EventEmitter = require('events');
const { Logger } = require('./utils/logger');

/**
 * Actors system data bus.
 */
class SystemBus extends EventEmitter {
  /**
   * @param {any} [options={}] Startup options.
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
   * @param {String[]} [senders=[]] Chain of actors (ID's) who sent that message.
   * @param {any} args Emission arguments.
   */
  emit(event, senders = [], ...args) {
    this._broadcastToRecipients(event, senders, ...args);
    super.emit(event, ...args);
  }

  /**
   * Adds recipient actor.
   * 
   * @param {ForkedActor} recipient Actor receiving messages.
   */
  addRecipient(recipient) {
    if (typeof recipient.sendBusMessage !== 'function') {
      this.log.error(`Trying to add invalid recipient to the system's bus: ${recipient}`);

      return;
    }

    this.recipients.add(recipient);
  }

  /**
   * Removes recipient actor.
   * 
   * @param {ForkedActor} recipient Actor receiving messages.
   */
  removeRecipient(recipient) {
    this.recipients.delete(recipient);
  }

  /**
   * Broadcasts event data to forked and remote systems.
   * 
   * @param {String} event Event name.
   * @param {String[]} [senders=[]] Chain of actors (ID's) who sent that message.
   * @param {any} args Emission arguments.
   */
  _broadcastToRecipients(event, senders = [], ...args) {
    this.recipients.forEach(recipient => {
      if (!senders.includes(recipient.getId())) {
        recipient.sendBusMessage(event, senders.concat(recipient.getId()), ...args);
      }
    });
  }
}

module.exports = SystemBus;