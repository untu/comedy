let ForkedActor = require('./forked-actor.js');
let ForkedActorChildParentProxy = require('./forked-actor-child-parent-proxy.js');
let WorkerThreadBusAdapter = require('./utils/worker-thread-bus-adapter.js');
let common = require('./utils/common.js');
let parentPort = common.tryRequire('worker_threads', 'parentPort');

/**
 * A threaded actor endpoint representing worker thread.
 */
class ThreadedActorChild extends ForkedActor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Actor} actor Wrapped actor.
   * - {Object} definition Actor behaviour definition.
   * - {String} [parentId] Parent ID.
   */
  constructor(options) {
    if (!parentPort) common.throwThreadedActorsUnavailableError();

    super({
      system: options.system,
      parent: null,
      definition: options.definition,
      bus: new WorkerThreadBusAdapter(parentPort),
      actor: options.actor
    });

    this.parentId = options.parentId;
  }

  getParent() {
    return new ForkedActorChildParentProxy(this, this.parentId);
  }

  send0() {
    return this._getActor().send.apply(this._getActor(), arguments);
  }

  sendAndReceive0() {
    return this._getActor().sendAndReceive.apply(this._getActor(), arguments);
  }

  /**
   * Sends a message to a parent actor on the other side of the communication channel.
   *
   * @param {String} topic Message topic.
   * @param {*} message Message body.
   * @returns {P} Operation promise.
   */
  sendToParent(topic, ...message) {
    let parentId = this.getParent().getId();

    return this._sendActorMessage(topic, message, { receive: false, actorId: parentId });
  }

  /**
   * Sends a message to a parent actor on the other side of the communication channel and waits
   * for response.
   *
   * @param {String} topic Message topic.
   * @param {*} message Message body.
   * @returns {P} Operation promise, which yields a remote actor response.
   */
  sendToParentAndReceive(topic, ...message) {
    let parentId = this.getParent().getId();

    return this._sendActorMessage(topic, message, { receive: true, actorId: parentId });
  }

  location0() {
    return this._getActor().location0();
  }

  toString() {
    let name = this.getName();

    if (name) {
      return 'ThreadedActorChild(' + this.getId() + ', ' + name + ')';
    }
    else {
      return 'ThreadedActorChild(' + this.getId() + ')';
    }
  }
}

module.exports = ThreadedActorChild;