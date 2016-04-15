'use strict';

var ActorSystem = require('./actor-system.js');
var log = require('../utils/log.js');

var system = ActorSystem.default();

process.once('message', msg => {
  if (msg.type == 'create-actor') {
    if (!msg.body) {
      process.send({ error: 'Missing message body in "create-actor" message' });

      return;
    }

    var beh = msg.body.behaviour;

    if (!beh) {
      process.send({ error: 'Missing behaviour in "create-actor" message' });

      return;
    }

    var compiledBeh;

    try {
      compiledBeh = eval('(' + beh + ')'); // jshint ignore:line
    }
    catch (err) {
      process.send({ error: 'Compilation error: ' + err });

      process.exit(1);
    }

    system.createActor(compiledBeh, {})
      .then(actor => {
        process.send({
          type: 'actor-created',
          body: {
            id: actor.getId()
          }
        });

        process.on('message', msg => {
          if (msg.type == 'actor-message') {
            if (!msg.body) return process.send({ error: 'Missing message body' });

            var topic = msg.body.topic;

            if (!topic) return process.send({ error: 'Missing message topic' });

            var sendPromise;

            if (msg.body.receive) {
              if (!msg.id) return process.send({ error: 'Missing message ID' });

              sendPromise = actor.sendAndReceive(topic, msg.body.message)
                .then(resp => process.send({
                  type: 'actor-response',
                  id: msg.id,
                  body: { response: resp }
                }));
            }
            else {
              sendPromise = actor.send(topic, msg.body.message);
            }

            sendPromise.catch(err => process.send({
              type: 'actor-response',
              id: msg.id,
              body: {
                error: err.message
              }
            }));
          }
          else if (msg.type == 'destroy-actor') {
            process.removeAllListeners('message');

            actor.destroy().then(() => {
              process.send({ type: 'actor-destroyed', id: msg.id }, () => {
                process.exit(0);
              });
            });
          }
          else {
            log.warn('Ignoring message of an unknown type: ', msg);
          }
        });
      });
  }
});