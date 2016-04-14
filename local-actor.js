'use strict';

var common = require('../saymon-common.js');
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

    if (common.isPlainObject(behaviour)) {
      // Plain object behaviour.
      this.behaviour = _.clone(behaviour);
      this.handlerContext = this;
    }
    else {
      // Class-defined behaviour.
      this.behaviour = behaviour;
      this.handlerContext = behaviour;
    }
  }

  getId() {
    return this.id;
  }

  initialize() {
    if (_.isFunction(this.behaviour.initialize)) {
      return this.behaviour.initialize.call(this.handlerContext, this);
    }
  }

  send0(topic, message) {
    return P.bind(this)
      .then(() => {
        var handler = this.behaviour[topic];

        if (handler) {
          if (_.isFunction(handler)) {
            try {
              handler.call(this.handlerContext, message);
            }
            catch (err) {
              // Ignore error from handler to satisfy method contract.
            }
          }
        }
        else {
          throw new Error('No handler for message, topic=' + topic + ', actor=' + this);
        }
      });
  }

  sendAndReceive0(topic, message) {
    return P.bind(this)
      .then(() => {
        var handler = this.behaviour[topic];

        if (handler) {
          if (_.isFunction(handler)) return handler.call(this.handlerContext, message);

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