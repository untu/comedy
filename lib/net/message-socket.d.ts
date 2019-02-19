/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

import { EventEmitter } from 'events';
import {Socket} from 'net';

export class MessageSocket extends EventEmitter {

  constructor(socket: Socket);

  // @ts-ignore
  on(event: string | symbol, listener: (...args: any[]) => void): void;

  // @ts-ignore
  once(event: string | symbol, listener: (...args: any[]) => void): void;

  // @ts-ignore
  removeListener(eventName: string | symbol, listener: (...args: any[]) => void): void;

  // @ts-ignore
  removeAllListeners(eventName?: string | symbol): void;

  write(message: object, cb: Function): void;

  send(message: object, cb?: Function): void;

  makePacket(message: object): Buffer;

  end(): void;

  destroy(): void;
}
