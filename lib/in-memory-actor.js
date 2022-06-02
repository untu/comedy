/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let Actor = require('./actor.js');
let P = require('bluebird');
let _ = require('underscore');
let os = require('os');

/**
 * A process-local (in-memory) actor.
 */
class InMemoryActor extends Actor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Actor|null} parent Actor parent or null, if it's a root actor.
   * - {Object} definition Actor behaviour definition.
   * - {Object} origDefinition Original actor definition.
   * - {Object} config Actor configuration.
   * - {String} [id] Actor ID. Generated if not specified.
   * - {String} [name] Actor name.
   * - {Object} [customParameters] Custom actor parameters.
   */
  constructor(options) {
    super({
      system: options.system,
      parent: options.parent,
      definition: options.definition,
      origDefinition: options.origDefinition,
      config: options.config,
      id: options.id || options.system.generateActorId(),
      name: options.name
    });

    this.parent = options.parent;
    this.pendingCount = 0; // Number of pending messages.
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
    this.pendingCount++;

    return P.resolve()
      .then(() => {
        let handler = this.definition[topic];

        if (_.isFunction(handler)) {
          P.resolve()
            .then(() => handler.apply(this.definition, message))
            .catch(err => {
              this.getLog().error('Error from handler, actor=' + this + ', topic=' + topic + ', error=' + err);
            })
            .finally(() => {
              this._afterHandled();
            });

            return null;
        }
        else {
          this._afterHandled();

          throw new Error('No handler for message, topic=' + topic + ', actor=' + this);
        }
      });
  }

  sendAndReceive0(topic, ...message) {
    this.pendingCount++;

    return P.resolve()
      .then(() => {
        let handler = this.definition[topic];

        if (handler) {
          if (_.isFunction(handler)) {
            return handler.apply(this.definition, message);
          }

          return handler;
        }
        else {
          throw new Error('No handler for message, topic=' + topic + ', actor=' + this);
        }
      })
      .finally(() => {
        this._afterHandled();
      });
  }

  async destroy0(self) {
    if (this.pendingCount !== 0) {
      let pending = {};
      let promise = new P((resolve, reject) => {
        pending = { resolve, reject };
      });
      this.destroyPromise0 = pending;
      await promise;
    }

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
    let name = this.getName();

    if (name) {
      return 'InMemoryActor(' + this.id + ', ' + name + ')';
    }
    else {
      return 'InMemoryActor(' + this.id + ')';
    }
  }

  /**
   * Invoked after a message has been handled (successfully or not).
   *
   * @private
   */
  _afterHandled() {
    this.pendingCount--;

    if (this.pendingCount === 0 && this.destroyPromise0) {
      this.destroyPromise0.resolve();
    }
  }
}

module.exports = InMemoryActor;
