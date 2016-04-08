'use strict';

var ActorSystem = require('./actor-system.js');
var ForkedActor = require('./forked-actor.js');

var system = ActorSystem.default();

process.once('message', (msg) => {
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

    var compiledBeh = eval('(' + beh + ')'); // jshint ignore:line

    system.createActor(compiledBeh, new ForkedActor(system, process))
      .then(actor => {
        process.send({
          type: 'actor-created',
          body: {
            id: actor.getId()
          }
        });
      });
  }
});