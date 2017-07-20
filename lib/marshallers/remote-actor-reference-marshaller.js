/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var InterHostReferenceTarget = require('../inter-host-reference-target.js');
var InterHostReferenceSource = require('../inter-host-reference-source.js');
var _ = require('underscore');
var P = require('bluebird');

/**
 * Marshalls actor reference for passing to remote actor.
 */
class RemoteActorReferenceMarshaller {
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
   * @returns {Promise} Data transfer object promise.
   */
  marshall(actor) {
    var id = actor.getId();
    var refPromise = this.refs[id];

    if (!refPromise) {
      var ref = new InterHostReferenceTarget(actor);
      refPromise = this.refs[id] = ref.initialize(this.system).return(ref);
    }

    return refPromise.then(ref => ref.toJSON());
  }

  /**
   * Un-marshalls actor reference from data transfer object.
   *
   * @param {Object} msg Data transfer object.
   * @returns {Promise} Un-marshalled actor reference instance promise.
   */
  unmarshall(msg) {
    var id = msg.actorId;
    var refPromise = this.refs[id];

    if (!refPromise) {
      var ref = InterHostReferenceSource.fromJSON(msg);
      refPromise = this.refs[id] = ref.initialize(this.system).return(ref);
    }

    return refPromise.then(ref => ref.toActorProxy(this.system));
  }

  /**
   * Destroys this marshaller, closing all references and freeing all resources.
   *
   * @returns {Promise} Operation promise.
   */
  destroy() {
    return P.map(_.values(this.refs), ref => ref.destroy());
  }
}

module.exports = RemoteActorReferenceMarshaller;