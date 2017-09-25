/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var AbstractActorReferenceMarshaller = require('./abstract-actor-reference-marshaller.js');
var InterHostReferenceTarget = require('../inter-host-reference-target.js');
var InterHostReferenceSource = require('../inter-host-reference-source.js');

/**
 * Marshalls actor reference for passing to remote actor.
 */
class RemoteActorReferenceMarshaller extends AbstractActorReferenceMarshaller {
  _createReferenceTarget(actor) {
    return new InterHostReferenceTarget(actor);
  }

  _createReferenceSource(msg) {
    return InterHostReferenceSource.fromJSON(msg);
  }
}

module.exports = RemoteActorReferenceMarshaller;