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
  initialize(selfActor: Actor): P<void>;

  destroy(): P<void>;
}

export interface ActorSystem {
  rootActor(): P<Actor>;

  destroy(): P<void>;
}

export function createSystem(options: Object): ActorSystem;