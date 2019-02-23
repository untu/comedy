/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/**
 * Entry point for forked or remote actor process.
 */

/* eslint no-eval: "off" */

require('babel-polyfill'); // Babel support for transpiled projects.
let _ = require('underscore');
let ActorSystem = require('./actor-system.js');
let { Logger, logLevels } = require('./utils/logger.js');

process.once('message', (msg, handle) => {
  if (msg.type != 'create-actor') return;

  let log = new Logger(msg.body.debug ? logLevels.Debug : logLevels.Info);

  if (!msg.body) {
    process.send({ error: 'Missing message body in "create-actor" message' });

    return;
  }

  if (!msg.body.parent) {
    process.send({ error: 'Missing parent definition in "create-actor" message' });

    return;
  }

  log.debug('Received "create-actor" message:', JSON.stringify(msg, null, 2), ', PID:', process.pid);

  let def = msg.body.definition;

  if (!def) {
    process.send({ error: 'Missing actor definition in "create-actor" message' });

    return;
  }

  if (msg.body.additionalRequires) {
    try {
      let requires0 = msg.body.additionalRequires;

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

  let marshallers = msg.body.marshallers;

  if (marshallers && msg.body.marshallerFormat == 'serialized') {
    marshallers = compileDefinition(msg.body.marshallers);
  }

  let balancers = msg.body.balancers;

  if (balancers && msg.body.balancerFormat == 'serialized') {
    balancers = compileDefinition(msg.body.balancers);
  }

  let resources = msg.body.resources;

  if (_.isArray(resources)) {
    resources = _.map(resources, (resource, idx) => {
      let format = msg.body.resourceFormat[idx];

      if (format == 'serialized') return compileDefinition(resource);

      return resource;
    });
  }

  // Un-marshall socket handles, if any.
  if (msg.body.customParametersMarshalledTypes) {
    let customParameters = msg.body.actorConfig.customParameters;

    _.each(msg.body.customParametersMarshalledTypes, (value, key) => {
      if (value == 'SocketHandle') {
        if (customParameters[key] == 'http.Server') {
          let srv0 = require('http').createServer();

          // Wrap net.Server into http.Server.
          srv0.listen(handle);

          customParameters[key] = srv0;
        }
        else {
          customParameters[key] = handle;
        }
      }
    });

    msg.body.actorConfig.customParameters = customParameters;
  }

  let logger = msg.body.logger;

  if (msg.body.loggerFormat == 'serialized') {
    logger = compileDefinition(msg.body.logger);
  }

  let system = new ActorSystem({
    marshallers: marshallers,
    balancers: balancers,
    resources: resources,
    config: msg.body.config,
    test: msg.body.test,
    debug: msg.body.debug,
    mode: msg.body.mode,
    parent: msg.body.parent,
    root: def,
    rootId: msg.body.id,
    rootName: msg.body.name,
    rootActorConfig: msg.body.actorConfig,
    rootParametersMarshalledTypes: msg.body.customParametersMarshalledTypes,
    logger: logger,
    loggerConfig: msg.body.loggerConfig,
    loggerParams: msg.body.loggerParams,
    additionalRequires: msg.body.additionalRequires,
    pingTimeout: msg.body.pingTimeout,
    clusters: msg.body.clusters
  });

  system.rootActor()
    .then(actor => {
      let createdMsg = {
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
      let errMsgPrefix = 'Failed to create forked actor' + (msg.body.name ? ' ' + msg.body.name : '') + ':';
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
      let behArr = eval(`(${def})`);

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

// noinspection JSUnusedLocalSymbols
function _classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) throw new TypeError('Cannot call a class as a function');
}

// TypeScript await support.
// noinspection JSUnresolvedVariable
let __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
  return new (P || (P = Promise))(function (resolve, reject) {
    function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
    function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
    function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};

/* eslint-enable */