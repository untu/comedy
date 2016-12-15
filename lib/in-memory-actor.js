/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
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

    this.initializing = true;
    this.parent = parent;

    if (common.isPlainObject(behaviour)) {
      // Plain object behaviour.
      this.behaviour = _.clone(behaviour);
    }
    else {
      // Class-defined behaviour.
      this.behaviour = behaviour;
    }
  }

  initialize(self) {
    return P.resolve()
      .then(() => {
        if (_.isFunction(this.behaviour.initialize)) {
          return this.behaviour.initialize(self || this);
        }
      })
      .catch(err => {
        this.getLog().warn('Actor initialization failed, destroying, error=', err);

        this.destroy();

        throw err;
      })
      .then(() => {
        this.initializing = false;
      });
  }

  send0(topic, ...message) {
    return P.resolve()
      .then(() => {
        if (this.initializing) return;

        var handler = this.behaviour[topic];

        if (handler) {
          if (_.isFunction(handler)) {
            try {
              handler.apply(this.behaviour, message);
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

  sendAndReceive0(topic, ...message) {
    return P.resolve()
      .then(() => {
        if (this.initializing) throw new Error('Actor is being initialized, topic=' + topic + ', actor=' + this);

        var handler = this.behaviour[topic];

        if (handler) {
          if (_.isFunction(handler)) {
            return handler.apply(this.behaviour, message);
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
      return this.behaviour.destroy(self || this);
    }
  }

  location0() {
    return {
      hostname: os.hostname(),
      pid: process.pid
    };
  }

  metrics0() {
    if (_.isFunction(this.behaviour.metrics)) {
      return this.behaviour.metrics();
    }

    return {};
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