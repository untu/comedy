/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let ForkedActor = require('./forked-actor.js');
let ActorStub = require('./actor-stub.js');
let childProcess = require('child_process');
let path = require('path');
let P = require('bluebird');
let _ = require('underscore');

/**
 * A forked actor endpoint representing a parent process.
 */
class ForkedActorParent extends ForkedActor {
  /**
   * @param {Object} options Actor options.
   * - {ActorSystem} system Actor system.
   * - {Actor} parent Parent actor.
   * - {Object} definition Actor behaviour definition.
   * - {String} name Actor name.
   * - {Object} [additionalOptions] Additional actor options.
   */
  constructor(options) {
    let name = options.additionalOptions && options.additionalOptions.name;
    let id = options.system.generateActorId();
    let config = _.omit(options.additionalOptions || {}, 'id', 'name');

    super({
      system: options.system,
      parent: options.parent,
      definition: options.definition,
      actor: new ActorStub({
        system: options.system,
        id: id,
        name: name,
        config
      }),
      config
    });

    this.id = id;
    this.name = name;
    this.definition = options.definition;
    this.additionalOptions = options.additionalOptions || {};
    this.log = this.getLog();
    this.exitHandler = () => {
      if (this.workerProcess) {
        this.log.debug('Killing forked actor ' + this);

        this.workerProcess.kill();
      }
    };
    process.once('exit', this.exitHandler);
  }

  initialize() {
    return P.resolve()
      .tap(() => this._createForkedWorker())
      .tap(() => super.initialize());
  }

  destroy0() {
    return this._send0({ type: 'destroy-actor' }, { receive: true })
      .tap(() => {
        process.removeListener('exit', this.exitHandler);
      });
  }

  changeGlobalConfigurationForChildren(config) {
    return this._send0({
      type: 'child-config-change',
      body: {
        config
      }
    }, { receive: true });
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
      return 'ForkedActorParent(' + this.getId() + ', ' + name + ')';
    }
    else {
      return 'ForkedActorParent(' + this.getId() + ')';
    }
  }

  /**
   * Creates forked process, which will handle messages, sent to this actor.
   *
   * @returns {P} Promise, which is resolved when worker process is ready to handle messages.
   * @private
   */
  _createForkedWorker() {
    return P.resolve().then(() => {
      let psArgs = [];

      this.name && psArgs.push(this.name);

      // Handle debugging: increment debugger port for child process.
      let execArgv = _.map(process.execArgv, arg => {
        let match = arg.match(/^--debug-brk=(\d+)/);

        if (match) {
          let debugPort = parseInt(match[1]);

          return '--debug-brk=' + (debugPort + this.debugPortCounter++);
        }

        return arg;
      });

      this.workerProcess =
        childProcess.fork(path.join(__dirname, '/forked-actor-worker.js'), psArgs, { execArgv: execArgv });

      this.log.debug('Forked new worker process, PID:', this.workerProcess.pid);

      return this.getSystem()
        .generateActorCreationMessage(
          this.definition,
          this,
          _.defaults({ mode: 'forked' }, this.additionalOptions)
        )
        .then(createMsg => {
          return new P((resolve, reject) => {
            const errCb = (err) => {
              if (err) return reject(err);

              // Wait for response from forked process.
              this.workerProcess.once('message', msg => {
                this.log.debug('Received "create-actor" message response:', msg);

                if (msg.error)
                  return reject(new Error(msg.error));

                if (msg.type != 'actor-created')
                  return reject(new Error('Unexpected response for "create-actor" message.'));

                this._setBus(this.workerProcess);

                resolve();
              });
            };

            // Send a message to forked process and await response.
            if (createMsg.socketHandle) {
              this.workerProcess.send(_.omit(createMsg, 'socketHandle'), createMsg.socketHandle, errCb);
            }
            else {
              this.workerProcess.send(createMsg, errCb);
            }

            // Handle forked process startup failure.
            this.workerProcess.once('error', err => {
              reject(new Error('Failed to fork: ' + err));
            });

            this.workerProcess.once('exit', () => {
              delete this.workerProcess;

              let respawn = this.additionalOptions.onCrash == 'respawn' &&
                this.getState() != 'destroying' && this.getState() != 'destroyed';

              this._setState('crashed');

              // Actor respawn support.
              if (respawn) {
                this.log.warn('Actor ' + this + ' has crashed, respawning...');

                this._createForkedWorker()
                  .then(() => {
                    this._setState('ready');

                    this.log.info('Actor ' + this + ' successfully respawned.');
                  })
                  .catch(err => {
                    this.log.error('Failed to respawn actor ' + this + ' (will retry in 15 seconds): ' + err);

                    P.delay(15000).then(() => {
                      this._createForkedWorker();
                    });
                  });
              }
              else {
                this.log.info('Actor process exited, actor ' + this);
              }
            });
          });
        });
    });
  }
}

module.exports = ForkedActorParent;
