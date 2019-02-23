/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

import {EventEmitter} from 'events';

export interface Logger {
  isDebug(): boolean;

  debug(...messages: any[]): void;

  info(...messages: any[]): void;

  warn(...messages: any[]): void;

  error(...messages: any[]): void;
}

export interface ParentActorRef {
  getId(): string;

  send(topic: string, ...message: any[]): Promise<void>;

  sendAndReceive(topic: string, ...message: any[]): Promise<any>;
}

export interface SystemBus extends EventEmitter {
}

export interface ActorRef extends EventEmitter {
  getId(): string;

  getName(): string;

  getLog(): Logger;

  getSystem(): ActorSystem;

  getMode(): string;

  getState(): string;

  getCustomParameters(): any;

  changeConfiguration(config: object): Promise<void>;

  changeGlobalConfiguration(config: object): Promise<void>;

  send(topic: string, ...message: any[]): Promise<void>;

  sendAndReceive(topic: string, ...message: any[]): Promise<any>;

  broadcast(topic: string, ...message: any[]): Promise<void>;

  broadcastAndReceive(topic: string, ...message: any[]): Promise<any[]>;

  forwardToParent(...topics: Array<string|RegExp>): void;

  forwardToChild(child: ActorRef, ...topics: Array<string|RegExp>): void;

  metrics(): Promise<any>;

  destroy(): Promise<void>;

  getBus(): SystemBus;

  tree(): Promise<Object>;
}

export interface Actor extends ActorRef {
  getParent(): ParentActorRef;

  createChild(behaviour: ActorDefinition|Object, options?: Object): Promise<ActorRef>;

  createChildren(modulePath: string, options?: Object): Promise<ActorRef[]>;
}

export interface ActorDefinition {
  initialize(selfActor: Actor): Promise<void>|void;

  destroy(): Promise<void>|void;
}

export interface ResourceDefinition<T> {
  initialize(system: ActorSystem): Promise<void>|void;

  destroy(): Promise<void>|void;

  getResource(): T;
}

export interface ActorSystem {
  rootActor(): Promise<Actor>;

  destroy(): Promise<void>;

  getBus(): SystemBus;

  listen(port?: number, host?: string): Promise<void>;

  getLog(): any;
}

export function createSystem(options: Object): ActorSystem;

export function inherits(subClass: any, superClass: any): void;
