/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var actors = require('../index');
var expect = require('chai').expect;
var P = require('bluebird');

var system;
var rootActor;

describe('RemoteActor', function() {
  beforeEach(function() {
    system = actors({
      test: true,
      additionalRequires: 'ts-node/register'
    });

    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  afterEach(function() {
    return system.destroy();
  });

  describe('sendAndReceive', function() {
    it('should perform message exchange with remote actor', P.coroutine(function*() {
      var behaviour = {
        getPid: () => {
          return process.pid;
        }
      };

      var remoteChild = yield rootActor.createChild(behaviour, { mode: 'remote', host: '127.0.0.1' });
      var remotePid = yield remoteChild.sendAndReceive('getPid');

      expect(remotePid).to.be.a.number;
      expect(remotePid).to.be.not.equal(process.pid);

      // Destroy remote actor.
      yield remoteChild.destroy();

      // From this point, any additional communication should not be possible.
      var expectedErr = yield remoteChild.sendAndReceive('getPid').catch(err => err);

      expect(expectedErr).to.be.instanceof(Error);
    }));
  });
});