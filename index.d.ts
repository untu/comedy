import P = require('bluebird');

export interface Logger {
  debug(...messages: any[]): void;

  info(...messages: any[]): void;

  warn(...messages: any[]): void;

  error(...messages: any[]): void;
}

export interface Actor {
  getLog(): Logger;

  getParent(): Actor;

  send(topic: string, ...message: any[]): P<void>;
}

export interface ActorBehaviour {
  initialize(selfActor: Actor): P<void>;

  destroy(): P<void>;
}
