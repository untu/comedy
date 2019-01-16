/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

/* eslint require-jsdoc: "off" */

import * as actors from '../../';
import {expect} from 'chai';
import {Actor, ActorSystem} from '../../index';
import {afterEach, beforeEach} from 'mocha';

let system: ActorSystem;
let rootActor: Actor;

describe('Hot configuration change', () => {
  beforeEach(() => {
    system = actors.createSystem({
      test: true,
      additionalRequires: 'ts-node/register'
    });

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  afterEach(() => system.destroy());

  it('should be able to programmatically change actor mode', async function() {
    let testActor = await rootActor.createChild({
      test: () => process.pid
    }, { mode: 'in-memory' });

    let localPid = await testActor.sendAndReceive('test');

    expect(localPid).to.be.a('number');

    await testActor.changeConfiguration({ mode: 'forked' });

    let remotePid = await testActor.sendAndReceive('test');

    expect(remotePid).to.be.a('number');
    expect(remotePid).to.be.not.equal(localPid);

    await testActor.changeConfiguration({ mode: 'in-memory' });

    let localPid2 = await testActor.sendAndReceive('test');

    expect(localPid2).to.be.equal(localPid);
  });
});