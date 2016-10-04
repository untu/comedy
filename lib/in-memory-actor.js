/*
 * ~ Copyright (c) 2014-2016 ROSSINNO, LTD.
 */

'use strict';

var common = require('./utils/common.js');
var Actor = require('./actor.js');
var P = require('bluebird');
var _ = require('underscore');
var os = require('os');

/**
 * A process-local (in-memory) actor.
 */
class InMemoryActor extends Actor {
  /**
   * @param {ActorSystem} system Actor system.
   * @param {Actor|null} parent Actor parent or null, if it's a root actor.
   * @param {Object} behaviour Actor behaviour definition.
   * @param {String} [name] Actor name.
   */
  constructor(system, parent, behaviour, name) {
    super(system, parent, system.generateActorId(), name);

    this.parent = parent;

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

  initialize(self) {
    if (_.isFunction(this.behaviour.initialize)) {
      return this.behaviour.initialize.call(this.handlerContext, self || this);
    }
  }

  send0(topic, message) {
    return P.bind(this)
      .then(() => {
        var handler = this.behaviour[topic];

        if (handler) {
          if (_.isFunction(handler)) {
            var args = [message];

            // Send additional arguments, if any.
            if (arguments.length > 2) {
              args = _.rest(_.toArray(arguments));
            }

            try {
              handler.apply(this.handlerContext, args);
            }
            catch (err) {
              this.getLog().error('Error from handler, actor=' + this + ', topic=' + topic + ', error=' + err);
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
          if (_.isFunction(handler)) {
            var args = [message];

            // Send additional arguments, if any.
            if (arguments.length > 2) {
              args = _.rest(_.toArray(arguments));
            }

            return handler.apply(this.handlerContext, args);
          }

          return handler;
        }
        else {
          throw new Error('No handler for message, topic=' + topic + ', actor=' + this);
        }
      });
  }
  
  destroy0(self) {
    if (_.isFunction(this.behaviour.destroy)) {
      return this.behaviour.destroy.call(this.handlerContext, self || this);
    }
  }

  location0() {
    return {
      hostname: os.hostname(),
      pid: process.pid
    };
  }

  toString() {
    var name = this.getName();
    
    if (name) {
      return 'InMemoryActor(' + this.id + ', ' + name + ')';
    }
    else {
      return 'InMemoryActor(' + this.id + ')';
    }
  }
}

module.exports = InMemoryActor;