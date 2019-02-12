/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

import {Actor, ActorSystem} from '../../index';
import {afterEach, beforeEach} from 'mocha';
import {expect} from 'chai';
import * as actors from '../../index';

let system: ActorSystem;
let rootActor: Actor;

describe('DisabledActor', () => {
  beforeEach(() => {
    system = actors.createSystem({
      test: true,
      additionalRequires: 'ts-node/register'
    });

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  afterEach(() => {
    return system.destroy();
  });

  it('should not be launched by actor system', async () => {
    let initialized = false;

    class TestActor {
      initialize(selfActor: Actor) {
        initialized = true;
      }
    }

    await rootActor.createChild(TestActor, { mode: 'disabled' });

    expect(initialized).to.be.equal(false);
  });

  it('should throw error on attempt to send a message to a disabled actor', async () => {
    class TestActor {
      test() {
        return 'OK!';
      }
    }

    let actor = await rootActor.createChild(TestActor, { mode: 'disabled' });
    let error: Error|undefined;

    try {
      await actor.sendAndReceive('test');
    }
    catch (err) {
      error = err;
    }

    expect(error).to.be.an.instanceof(Error);
  });
});
