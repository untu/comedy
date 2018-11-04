/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let AbstractActorReferenceMarshaller = require('./abstract-actor-reference-marshaller.js');
let InterProcessReferenceTarget = require('../inter-process-reference-target.js');
let InterProcessReferenceSource = require('../inter-process-reference-source.js');

/**
 * Marshalls actor reference for passing to forked actor.
 */
class ForkedActorReferenceMarshaller extends AbstractActorReferenceMarshaller {
  _createReferenceTarget(actor) {
    return new InterProcessReferenceTarget(actor);
  }

  _createReferenceSource(msg) {
    return InterProcessReferenceSource.fromJSON(msg);
  }
}

module.exports = ForkedActorReferenceMarshaller;