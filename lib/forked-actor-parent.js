/*
 * Copyright (c) 2016 Untu, Inc.
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
   * @param {ActorSystem} system Actor system.
   * @param {Actor} parent Parent actor.
   * @param {Object} bus Message bus to send/receive messages.
   * @param {String} id Actor ID.
   * @param {String} name Actor name.
   */
  constructor(system, parent, bus, id, name) {
    super(system, parent, bus, new ActorStub(system, id, name));
  }

  tree() {
    return this._send0({ type: 'actor-tree' }, { receive: true });
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