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

  it('should be able to programmatically change actor mode ("in-memory" -> "forked")', async function() {
    let testActor = await rootActor.createChild({
      test: () => process.pid
    }, { mode: 'in-memory' });

    let localPid = await testActor.sendAndReceive('test');

    expect(localPid).to.be.a('number');

    await testActor.changeConfiguration({ mode: 'forked' });

    let forkedPid = await testActor.sendAndReceive('test');

    expect(forkedPid).to.be.a('number');
    expect(forkedPid).to.be.not.equal(localPid);

    await testActor.changeConfiguration({ mode: 'in-memory' });

    let localPid2 = await testActor.sendAndReceive('test');

    expect(localPid2).to.be.equal(localPid);
  });

  it('should be able to programmatically change actor mode ("forked" -> "in-memory")', async function() {
    let testActor = await rootActor.createChild({
      test: () => process.pid
    }, { mode: 'forked' });

    let forkedPid = await testActor.sendAndReceive('test');

    expect(forkedPid).to.be.a('number');
    expect(forkedPid).to.be.not.equal(process.pid);

    await testActor.changeConfiguration({ mode: 'in-memory' });

    let localPid = await testActor.sendAndReceive('test');

    expect(localPid).to.be.a('number');
    expect(localPid).to.be.equal(process.pid);

    await testActor.changeConfiguration({ mode: 'forked' });

    let forkedPid2 = await testActor.sendAndReceive('test');

    expect(forkedPid2).to.be.a('number');
    expect(forkedPid2).to.be.not.equal(process.pid);
    expect(forkedPid2).to.be.not.equal(forkedPid);
  });
});