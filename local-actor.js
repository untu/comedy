'use strict';

var Actor = require('./actor.js');
var P = require('bluebird');
var _ = require('underscore');

/**
 * A process-local (in-memory) actor.
 */
class LocalActor extends Actor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Actor|null} parent Actor parent or null, if it's a root actor.
   * @param {Object} behaviour Actor behaviour definition.
   */
  constructor(system, parent, behaviour) {
    super(system);

    this.parent = parent;
    this.id = system.generateActorId();
    this.behaviour = _.clone(behaviour);
  }

  getId() {
    return this.id;
  }

  send(topic, message) {
    return P.bind(this)
      .then(() => {
        var handler = this.behaviour[topic];

        if (handler) {
          if (_.isFunction(handler)) handler.call(this, message);
        }
        else {
          throw new Error('No handler for message, topic=' + topic + ', actor=' + this);
        }
      });
  }

  sendAndReceive(topic, message) {
    return P.bind(this)
      .then(() => {
        var handler = this.behaviour[topic];

        if (handler) {
          if (_.isFunction(handler)) return handler.call(this, message);

          return handler;
        }
        else {
          throw new Error('No handler for message, topic=' + topic + ', actor=' + this);
        }
      });
  }

  toString() {
    return 'LocalActor(' + this.id + ')';
  }
}

module.exports = LocalActor;