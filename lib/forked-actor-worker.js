/*
 * ~ Copyright (c) 2014-2016 ROSSINNO, LTD.
 */

'use strict';

/* eslint no-eval: "off" */

require('babel-polyfill');
require('ts-node/register'); // TypeScript support.
var _ = require('underscore');
var ActorSystem = require('./actor-system.js');
var Logger = require('../../utils/logger.js');

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

  var marshallers;

  if (msg.body.marshallers) {
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
    log: log
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

      process.send({ error: 'Failed to create forked actor: ' + err });
      process.exit(1);
    });
});

/**
 * Compiles a serialized actor behaviour.
 *
 * @param {String} behaviour Serialized behaviour.
 * @returns {*} Compiled actor behaviour.
 */
function compileBehaviour(behaviour) {
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

// --------------- Babel support ---------------------------

/* eslint-disable */

// noinspection JSUnusedLocalSymbols
function _createClass() {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;

      if ('value' in descriptor) descriptor.writable = true;

      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function(Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);

    if (staticProps) defineProperties(Constructor, staticProps);

    return Constructor;
  };
}

// noinspection JSUnusedLocalSymbols
function _classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError('Cannot call a class as a function');
  }
}

// noinspection JSUnusedLocalSymbols
function _possibleConstructorReturn(self, call) {
  if (!self) {
    throw new Error('this hasn\'t been initialised - super() hasn\'t been called');
  }

  return call && (typeof call === 'object' || typeof call === 'function') ? call : self;
}

// noinspection JSUnusedLocalSymbols
function _inherits(subClass, superClass) {
  return ActorSystem.inherits(subClass, superClass);
}

/* eslint-enable */