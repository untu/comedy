'use strict';

require('ts-node/register'); // TypeScript support.
var ActorSystem = require('./actor-system.js');
var Logger = require('../utils/logger.js');

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

  var compiledBeh = compileBehaviour(beh);
  var context = {};

  if (msg.body.context) {
    context = compileBehaviour(msg.body.context);
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
    root: compiledBeh,
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
    if (behaviour[0] == '{' || behaviour[0] == '[') {
      // Plain object defined behaviour => wrap in braces.
      behaviour = '(' + behaviour + ')';
    }

    return eval(behaviour); // eslint-disable-line
  }
  catch (err) {
    process.send({ error: 'Compilation error: ' + err });

    process.exit(1);
  }
}