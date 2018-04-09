/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/* eslint no-eval: "off" */

var _ = require('underscore');
var ActorSystem = require('./actor-system.js');
var Logger = require('./utils/logger.js');

process.once('message', (msg, handle) => {
  if (msg.type != 'create-actor') return;

  var log = new Logger();

  if (!msg.body) {
    process.send({ error: 'Missing message body in "create-actor" message' });

    return;
  }

  if (!msg.body.parent) {
    process.send({ error: 'Missing parent definition in "create-actor" message' });

    return;
  }

  log.debug('Received "create-actor" message:', msg, ', PID:', process.pid);

  var def = msg.body.definition;

  if (!def) {
    process.send({ error: 'Missing actor definition in "create-actor" message' });

    return;
  }

  if (msg.body.additionalRequires) {
    try {
      var requires0 = msg.body.additionalRequires;

      _.isArray(requires0) || (requires0 = [requires0]);

      _.each(requires0, path => {
        require(path);
      });
    }
    catch (err) {
      process.send({ error: 'Error while requiring additional modules: ' + err });

      return;
    }
  }

  if (msg.body.definitionFormat == 'serialized') {
    def = compileDefinition(def);
  }

  var marshallers = msg.body.marshallers;

  if (marshallers && msg.body.marshallerFormat == 'serialized') {
    marshallers = compileDefinition(msg.body.marshallers);
  }

  var resources = msg.body.resources;

  if (_.isArray(resources)) {
    resources = _.map(resources, (resource, idx) => {
      var format = msg.body.resourceFormat[idx];

      if (format == 'serialized') return compileDefinition(resource);

      return resource;
    });
  }

  var customParameters = msg.body.customParameters;

  // Un-marshall socket handles, if any.
  if (msg.body.customParametersMarshalledTypes) {
    _.each(msg.body.customParametersMarshalledTypes, (value, key) => {
      if (value == 'SocketHandle') {
        if (customParameters[key] == 'http.Server') {
          var srv0 = require('http').createServer();

          // Wrap net.Server into http.Server.
          srv0.listen(handle);

          customParameters[key] = srv0;
        }
        else {
          customParameters[key] = handle;
        }
      }
    });
  }

  var system = new ActorSystem({
    marshallers: marshallers,
    resources: resources,
    config: msg.body.config,
    test: msg.body.test,
    debug: msg.body.debug,
    mode: msg.body.mode,
    parent: msg.body.parent,
    root: def,
    rootId: msg.body.id,
    rootParameters: customParameters,
    rootParametersMarshalledTypes: msg.body.customParametersMarshalledTypes,
    loggerConfig: msg.body.loggerConfig,
    additionalRequires: msg.body.additionalRequires,
    pingTimeout: msg.body.pingTimeout,
    clusters: msg.body.clusters
  });

  system.rootActor()
    .then(actor => {
      var createdMsg = {
        type: 'actor-created',
        body: {
          id: actor.getId()
        }
      };

      if (msg.body.mode == 'remote') {
        createdMsg.body.port = actor.getPort();
      }

      log.debug('Sending response for "create-actor" message ("actor-created"):', createdMsg);

      process.send(createdMsg);
    })
    .catch(err => {
      var errMsgPrefix = 'Failed to create forked actor' + (msg.body.name ? ' ' + msg.body.name : '') + ':';
      log.error(errMsgPrefix, err.stack);

      try {
        process.send({ error: errMsgPrefix + ' ' + err });
      }
      finally {
        process.exit(1);
      }
    });
});

/**
 * Compiles a serialized actor definition.
 *
 * @param {String|String[]} def Serialized definition.
 * @returns {*} Compiled actor definition.
 */
function compileDefinition(def) {
  if (_.isArray(def)) {
    return _.map(def, compileDefinition);
  }

  try {
    if (def[0] == '{') {
      // Plain object defined behaviour => wrap in braces.
      return eval(`(${def})`);
    }
    else if (def[0] == '[') {
      // Definition array => first deserialize array, then definitions inside.
      var behArr = eval(`(${def})`);

      return _.map(behArr, item => compileDefinition(item));
    }

    return eval(def);
  }
  catch (err) {
    process.send({ error: 'Compilation error: ' + err });

    process.exit(1);
  }
}

/* eslint-disable */

// ES5 class inheritance support.
// noinspection JSUnusedLocalSymbols
function _inherits(subClass, superClass) {
  return ActorSystem.inherits(subClass, superClass);
}

/* eslint-enable */