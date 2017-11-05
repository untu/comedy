/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var Actor = require('./actor.js');
var P = require('bluebird');
var _ = require('underscore');
var os = require('os');

/**
 * A process-local (in-memory) actor.
 */
class InMemoryActor extends Actor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Actor|null} parent Actor parent or null, if it's a root actor.
   * - {Object} definition Actor behaviour definition.
   * - {String} [id] Actor ID. Generated if not specified.
   * - {String} [name] Actor name.
   * - {Object} [customParameters] Custom actor parameters.
   */
  constructor(options) {
    super({
      system: options.system,
      parent: options.parent,
      definition: options.definition,
      id: options.id || options.system.generateActorId(),
      name: options.name,
      customParameters: options.customParameters
    });

    this.parent = options.parent;
  }

  initialize(self) {
    return P.resolve()
      .then(() => {
        if (_.isFunction(this.definition.initialize)) {
          return this.definition.initialize(self || this);
        }
      })
      .catch(err => {
        this.getLog().warn('Actor initialization failed, destroying, error=', err);

        this.destroy();

        throw err;
      })
      .then(() => {
        this._setState('ready');
      });
  }

  getMode() {
    return 'in-memory';
  }

  send0(topic, ...message) {
    return P.resolve()
      .then(() => {
        if (this.getState() != 'ready')
          throw new Error('Actor is being initialized, topic=' + topic + ', actor=' + this);

        var handler = this.definition[topic];

        if (handler) {
          if (_.isFunction(handler)) {
            try {
              handler.apply(this.definition, message);
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
        if (this.getState() != 'ready')
          throw new Error('Actor is being initialized, topic=' + topic + ', actor=' + this);

        var handler = this.definition[topic];

        if (handler) {
          if (_.isFunction(handler)) {
            return handler.apply(this.definition, message);
          }

          return handler;
        }
        else {
          throw new Error('No handler for message, topic=' + topic + ', actor=' + this);
        }
      });
  }
  
  destroy0(self) {
    if (_.isFunction(this.definition.destroy)) {
      return this.definition.destroy(self || this);
    }
  }

  location0() {
    return {
      hostname: os.hostname(),
      pid: process.pid
    };
  }

  metrics0() {
    if (_.isFunction(this.definition.metrics)) {
      return this.definition.metrics();
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