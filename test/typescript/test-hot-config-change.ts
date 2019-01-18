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

  it('should be able to programmatically change clustering mode in "in-memory" mode', async function() {
    let mode = 'in-memory';
    let pidCounter = 1;
    let testActor = await rootActor.createChild({
      initialize: function() {
        this.pid = pidCounter++;
      },

      test: function() {
        return this.pid;
      }
    }, { mode });

    let pid = await testActor.sendAndReceive('test');

    expect(pid).to.be.equal(1);

    await testActor.changeConfiguration({ mode, clusterSize: 2 });

    let pid1 = await testActor.sendAndReceive('test');
    let pid2 = await testActor.sendAndReceive('test');

    expect(pid1).to.be.equal(2);
    expect(pid2).to.be.equal(3);

    await testActor.changeConfiguration({ mode, clusterSize: 3 });

    let pid3 = await testActor.sendAndReceive('test');

    expect(pid3).to.be.equal(5); // Additional PID was used for balancer actor.

    let pid11 = await testActor.sendAndReceive('test');

    expect(pid11).to.be.equal(pid1);

    let pid22 = await testActor.sendAndReceive('test');

    expect(pid22).to.be.equal(pid2);

    await testActor.changeConfiguration({ mode, clusterSize: 2 });

    let pid222 = await testActor.sendAndReceive('test');

    expect(pid222).to.be.equal(pid2);

    let pid33 = await testActor.sendAndReceive('test');

    expect(pid33).to.be.equal(pid3);
  });

  it('should be able to programmatically change clustering mode in "forked" mode', async function() {
    let mode = 'forked';
    let testActor = await rootActor.createChild({
      test: () => process.pid
    }, { mode });

    let forkedPid = await testActor.sendAndReceive('test');

    expect(forkedPid).to.be.a('number');
    expect(forkedPid).to.be.not.equal(process.pid);

    await testActor.changeConfiguration({ mode, clusterSize: 2 });

    let pid1 = await testActor.sendAndReceive('test');
    let pid2 = await testActor.sendAndReceive('test');

    expect(pid1).to.be.a('number');
    expect(pid1).to.be.not.equal(forkedPid);
    expect(pid2).to.be.a('number');
    expect(pid2).to.be.not.equal(forkedPid);
    expect(pid2).to.be.not.equal(pid1);

    await testActor.changeConfiguration({ mode, clusterSize: 3 });

    let pid3 = await testActor.sendAndReceive('test');

    expect(pid3).to.be.a('number');
    expect(pid3).to.be.not.equal(pid1);
    expect(pid3).to.be.not.equal(pid2);

    let pid11 = await testActor.sendAndReceive('test');

    expect(pid11).to.be.equal(pid1);

    let pid22 = await testActor.sendAndReceive('test');

    expect(pid22).to.be.equal(pid2);

    await testActor.changeConfiguration({ mode, clusterSize: 2 });

    let pid222 = await testActor.sendAndReceive('test');

    expect(pid222).to.be.equal(pid2);

    let pid33 = await testActor.sendAndReceive('test');

    expect(pid33).to.be.equal(pid3);
  });
});