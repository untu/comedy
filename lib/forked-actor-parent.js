/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var ForkedActor = require('./forked-actor.js');
var ActorStub = require('./actor-stub.js');

/**
 * A forked actor endpoint representing a parent process.
 */
class ForkedActorParent extends ForkedActor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Actor} parent Parent actor.
   * - {Object} definition Actor behaviour definition.
   * - {Object} bus Message bus to send/receive messages.
   * - {String} id Actor ID.
   * - {String} name Actor name.
   */
  constructor(options) {
    super({
      system: options.system,
      parent: options.parent,
      definition: options.definition,
      bus: options.bus,
      actor: new ActorStub({ system: options.system, id: options.id, name: options.name })
    });
  }

  destroy0() {
    return this._send0({ type: 'destroy-actor' }, { receive: true });
  }

  tree() {
    return this._send0({ type: 'actor-tree' }, { receive: true });
  }

  metrics() {
    return this._send0({ type: 'actor-metrics' }, { receive: true });
  }
  
  toString() {
    var name = this.getName();

    if (name) {
      return 'ForkedActorParent(' + this.getId() + ', ' + name + ')';
    }
    else {
      return 'ForkedActorParent(' + this.getId() + ')';
    }
  }
}

module.exports = ForkedActorParent;