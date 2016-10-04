/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

import P = require('bluebird');

export interface Logger {
  isDebug(): boolean;

  debug(...messages: any[]): void;

  info(...messages: any[]): void;

  warn(...messages: any[]): void;

  error(...messages: any[]): void;
}

export interface Actor {
  getLog(): Logger;

  getParent(): Actor;

  createChild(behaviour: ActorBehaviour|Object, options?: Object): P<Actor>;

  send(topic: string, ...message: any[]): P<void>;

  sendAndReceive(topic: string, ...message: any[]): P<any>;
}

export interface ActorBehaviour {
  initialize(selfActor: Actor): P<void>|void;

  destroy(): P<void>|void;
}

export interface ActorSystem {
  rootActor(): P<Actor>;

  destroy(): P<void>;
}

export function createSystem(options: Object): ActorSystem;