/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/* eslint no-eval: "off" */

require('ts-node/register'); // TypeScript support.
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

  var beh = msg.body.behaviour;

  if (!beh) {
    process.send({ error: 'Missing behaviour in "create-actor" message' });

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

  if (msg.body.behaviourFormat == 'serialized') {
    beh = compileBehaviour(beh);
  }

  var context = {};

  if (msg.body.context) {
    if (msg.body.contextFormat == 'serialized') {
      context = compileBehaviour(msg.body.context);
    }
    else {
      context = msg.body.context;
    }
  }

  var marshallers = msg.body.marshallers;

  if (marshallers && msg.body.marshallerFormat == 'serialized') {
    marshallers = compileBehaviour(msg.body.marshallers);
  }

  var log = new Logger();

  if (msg.body.logLevel) {
    log.setLevel(msg.body.logLevel);
  }

  var system = new ActorSystem({
    context: context,
    marshallers: marshallers,
    config: msg.body.config,
    test: msg.body.test,
    debug: msg.body.debug,
    forked: msg.body.parent,
    root: beh,
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
 * Compiles a serialized actor behaviour.
 *
 * @param {String|String[]} behaviour Serialized behaviour.
 * @returns {*} Compiled actor behaviour.
 */
function compileBehaviour(behaviour) {
  if (_.isArray(behaviour)) {
    return _.map(behaviour, compileBehaviour);
  }

  try {
    if (behaviour[0] == '{') {
      // Plain object defined behaviour => wrap in braces.
      return eval(`(${behaviour})`);
    }
    else if (behaviour[0] == '[') {
      // Behaviour array => first deserialize array, then behaviours inside.
      var behArr = eval(`(${behaviour})`);

      return _.map(behArr, item => compileBehaviour(item));
    }

    return eval(behaviour);
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