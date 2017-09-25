/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

import {ResourceDefinition, ActorSystem} from '../index';

/**
 * Test TypeScript message resource.
 */
export default class MessageResource implements ResourceDefinition<string> {
  private message: string;

  initialize(system: ActorSystem): Promise<void>|void {
    this.message = 'Hi there!';
  }

  destroy(): Promise<void>|void {
    return undefined;
  }

  getResource(): string {
    return this.message;
  }
}