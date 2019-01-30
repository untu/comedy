/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let ForkedActor = require('./forked-actor.js');
let ActorStub = require('./actor-stub.js');
let common = require('./utils/common.js');
let WorkerThreadBusAdapter = require('./utils/worker-thread-bus-adapter.js');
let path = require('path');
let Worker = common.tryRequire('worker_threads', 'Worker');
let P = require('bluebird');
let _ = require('underscore');

/**
 * A threaded actor endpoint representing a parent process.
 */
class ThreadedActorParent extends ForkedActor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Actor} parent Parent actor.
   * - {Object} definition Actor behaviour definition.
   * - {String} name Actor name.
   * - {Object} [additionalOptions] Additional actor options.
   */
  constructor(options) {
    if (!Worker) common.throwThreadedActorsUnavailableError();

    let name = options.additionalOptions && options.additionalOptions.name;
    let id = options.system.generateActorId();

    super({
      system: options.system,
      parent: options.parent,
      definition: options.definition,
      actor: new ActorStub({
        system: options.system,
        id: id,
        name: name
      }),
      config: _.omit(options.additionalOptions || {}, 'id', 'name')
    });

    this.id = id;
    this.name = name;
    this.definition = options.definition;
    this.additionalOptions = options.additionalOptions || {};
    this.log = this.getLog();
  }

  initialize() {
    return P.resolve()
      .tap(() => this._createThreadedWorker())
      .tap(() => super.initialize());
  }

  getMode() {
    return 'threaded';
  }

  destroy0() {
    return this._send0({ type: 'destroy-actor' }, { receive: true });
  }

  tree() {
    return this._send0({ type: 'actor-tree' }, { receive: true });
  }

  metrics() {
    return this._send0({ type: 'actor-metrics' }, { receive: true });
  }

  toString() {
    let name = this.getName();

    if (name) {
      return 'ThreadedActorParent(' + this.getId() + ', ' + name + ')';
    }
    else {
      return 'ThreadedActorParent(' + this.getId() + ')';
    }
  }

  changeGlobalConfigurationForChildren(config) {
    return this._send0({
      type: 'child-config-change',
      body: {
        config
      }
    }, { receive: true });
  }

  /**
   * Creates threaded worker process, which will handle messages, sent to this actor.
   *
   * @returns {P} Promise, which is resolved when worker process is ready to handle messages.
   * @private
   */
  _createThreadedWorker() {
    return this.getSystem()
      .generateActorCreationMessage(
        this.definition,
        this,
        _.defaults({ mode: 'threaded' }, this.additionalOptions)
      )
      .then(createMsg => {
        return new P((resolve, reject) => {
          this.worker = new Worker(
            path.join(__dirname, '/threaded-actor-worker.js'),
            { workerData: createMsg });

          this.worker.once('exit', () => {
            delete this.worker;

            this.log.info('Actor worker process exited, actor ' + this);
          });

          // Wait for response from worker process.
          this.worker.once('message', msg => {
            this.log.debug('Received "create-actor" message response:', msg);

            if (msg.error)
              return reject(new Error(msg.error));

            if (msg.type != 'actor-created')
              return reject(new Error('Unexpected response for "create-actor" message.'));

            this._setBus(new WorkerThreadBusAdapter(this.worker));

            resolve();
          });
        });
      });
  }
}

module.exports = ThreadedActorParent;