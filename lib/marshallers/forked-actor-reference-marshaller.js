/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var InterProcessReferenceTarget = require('../inter-process-reference-target.js');
var InterProcessReferenceSource = require('../inter-process-reference-source.js');
var P = require('bluebird');
var _ = require('underscore');

/**
 * Marshalls actor reference for passing to forked actor.
 */
class ForkedActorReferenceMarshaller {
  /**
   * @param {ActorSystem} system Actor system.
   */
  constructor(system) {
    this.system = system;
    this.refs = {}; // Existing actor references.
  }

  /**
   * Marshalls an actor instance.
   *
   * @param {Actor} actor Actor to marshall.
   * @returns {Object} Data transfer object.
   */
  marshall(actor) {
    var id = actor.getId();
    var ref = this.refs[id];

    if (!ref) {
      ref = new InterProcessReferenceTarget(actor);
      this.refs[id] = ref;
    }

    return ref.toJSON();
  }

  /**
   * Un-marshalls actor reference from data transfer object.
   *
   * @param {Object} msg Data transfer object.
   * @returns {ForkedActorProxy} Un-marshalled actor reference instance.
   */
  unmarshall(msg) {
    var id = msg.actorId;
    var ref = this.refs[id];

    if (!ref) {
      ref = InterProcessReferenceSource.fromJSON(msg);
      this.refs[id] = ref;
    }

    return ref.toActorProxy(this.system);
  }

  /**
   * Destroys this marshaller, closing all references and freeing all resources.
   *
   * @returns {P} Operation promise.
   */
  destroy() {
    return P.map(_.values(this.refs), ref => ref.destroy());
  }
}

module.exports = ForkedActorReferenceMarshaller;