/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/* eslint no-eval: "off" */

var _ = require('underscore');
var ActorSystem = require('./actor-system.js');
var Logger = require('./utils/logger.js');

process.once('message', msg => {
  if (msg.type != 'create-actor') return;

  if (!msg.body) {
    process.send({ error: 'Missing message body in "create-actor" message' });

    return;
  }
  
  if (!msg.body.parent) {
    process.send({ error: 'Missing parent definition in "create-actor" message' });
    
    return;
  }

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

  var context = {};

  if (msg.body.context) {
    if (msg.body.contextFormat == 'serialized') {
      context = compileDefinition(msg.body.context);
    }
    else {
      context = msg.body.context;
    }
  }

  var marshallers = msg.body.marshallers;

  if (marshallers && msg.body.marshallerFormat == 'serialized') {
    marshallers = compileDefinition(msg.body.marshallers);
  }

  var resources = msg.body.resources;

  if (resources && msg.body.resourceFormat == 'serialized') {
    resources = compileDefinition(msg.body.resources);
  }

  var log = new Logger();

  if (msg.body.logLevel) {
    log.setLevel(msg.body.logLevel);
  }

  var system = new ActorSystem({
    context: context,
    marshallers: marshallers,
    resources: resources,
    config: msg.body.config,
    test: msg.body.test,
    debug: msg.body.debug,
    forked: msg.body.parent,
    root: def,
    rootParameters: msg.body.customParameters,
    log: log,
    additionalRequires: msg.body.additionalRequires
  });

  system.rootActor()
    .then(actor => {
      process.send({
        type: 'actor-created',
        body: {
          id: actor.getId()
        }
      });
    })
    .catch(err => {
      log.error('Failed to create forked actor:', err.stack);

      try {
        process.send({ error: 'Failed to create forked actor: ' + err });
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