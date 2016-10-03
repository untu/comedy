'use strict';

var actors = require('../index');
var expect = require('chai').expect;
var P = require('bluebird');
var _ = require('underscore');

var system = actors({ test: true });
var rootActor;

describe('ClusteredActor', function() {
  before(function() {
    return system.rootActor().then(rootActor0 => {
      rootActor = rootActor0;
    });
  });

  it('should properly clusterize with round robin balancing strategy', P.coroutine(function*() {
    var childBeh = {
      getPid: () => process.pid
    };

    // This should create local router and 3 sub-processes.
    var router = yield rootActor.createChild(childBeh, { mode: 'forked', clusterSize: 3 });

    var promises = _.times(6, () => router.sendAndReceive('getPid'));
    var results = yield P.all(promises);

    // Results should be separate process PIDs.
    _.each(results, result => {
      expect(result).to.be.a.number;
      expect(result).to.be.not.equal(process.pid);
    });

    // Checks results of round-robin logic.
    _.times(3, idx => {
      expect(results[idx]).to.be.equal(results[idx + 3]);
    });
  }));
});