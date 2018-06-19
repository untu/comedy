/*
 * Copyright (c) 2016-2017 Untu, Inc.
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

export interface ParentActor {
  getId(): string;

  send(topic: string, ...message: any[]): Promise<void>;

  sendAndReceive(topic: string, ...message: any[]): Promise<any>;
}

export interface Actor extends EventEmitter {
  getId(): string;

  getName(): string;

  getLog(): Logger;

  getParent(): ParentActor;

  getSystem(): ActorSystem;

  getMode(): string;

  getState(): string;

  getCustomParameters(): any;

  createChild(behaviour: ActorDefinition|Object, options?: Object): Promise<Actor>;

  createChildren(modulePath: string): Promise<Actor[]>;

  send(topic: string, ...message: any[]): Promise<void>;

  sendAndReceive(topic: string, ...message: any[]): Promise<any>;

  forwardToParent(...topics: Array<string|RegExp>): void;

  forwardToChild(child: Actor, ...topics: Array<string|RegExp>): void;

  metrics(): Promise<Object>;

  destroy(): Promise<void>;
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
}

export function createSystem(options: Object): ActorSystem;