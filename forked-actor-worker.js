'use strict';

var ActorSystem = require('./actor-system.js');

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

  var system = new ActorSystem({
    context: context,
    config: msg.body.config,
    test: msg.body.test,
    debug: msg.body.debug,
    forked: msg.body.parent,
    root: compiledBeh
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
    if (behaviour[0] == '{') {
      // Plain object defined behaviour => wrap in braces.
      behaviour = '(' + behaviour + ')';
    }

    return eval(behaviour); // jshint ignore:line
  }
  catch (err) {
    process.send({ error: 'Compilation error: ' + err });

    process.exit(1);
  }
}

// --------------- Babel support ---------------------------

//noinspection JSUnusedLocalSymbols
function _createClass() { // jshint ignore:line
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

//noinspection JSUnusedLocalSymbols
function _classCallCheck(instance, Constructor) { // jshint ignore:line
  if (!(instance instanceof Constructor)) {
    throw new TypeError('Cannot call a class as a function');
  }
}

//noinspection JSUnusedLocalSymbols
function _possibleConstructorReturn(self, call) { // jshint ignore:line
  if (!self) {
    throw new Error('this hasn\'t been initialised - super() hasn\'t been called');
  }

  return call && (typeof call === 'object' || typeof call === 'function') ? call : self;
}

//noinspection JSUnusedLocalSymbols
function _inherits(subClass, superClass) { // jshint ignore:line
  return ActorSystem.inherits(subClass, superClass);
}
