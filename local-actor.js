'use strict';

var common = require('../saymon-common.js');
var log = require('../utils/log.js');
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
    super(system, parent);

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
      this.behaviourName = behaviour.constructor.name;
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
              log.error('Error from handler, actor=' + this + ', topic=' + topic + ', error=' + err);
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

  /**
   * Sets this actor to forward messages with given topics to it's parent.
   * Topic names can be specified using an array or via varargs.
   */
  forwardToParent() {
    if (arguments.length === 0) return;

    var args = arguments[0];

    if (arguments.length > 1) {
      args = _.toArray(arguments);
    }
    else if (!_.isArray(arguments[0])) {
      args = [arguments[0]];
    }

    _.each(args, topic => {
      this.behaviour[topic] = function() {
        return this.parent.send.apply(this.parent, [topic].concat(_.toArray(arguments)));
      }.bind(this);
    });
  }

  toString() {
    if (this.behaviourName) {
      return 'LocalActor(' + this.behaviourName + '(' + this.id + '))';
    }
    else {
      return 'LocalActor(' + this.id + ')';
    }
  }
}

module.exports = LocalActor;