'use strict';

var Logger = require('../../utils/logger.js');
var _ = require('underscore');

/**
 * Logger for a particular actor. Prefixes all messages with actor name.
 */
class ActorLogger extends Logger {
  /**
   * @param log Wrapped logger.
   * @param actor Owning actor.
   */
  constructor(log, actor) {
    super(log);
    
    this.actorString = actor.toString() + ':';
  }
  
  beforeLog(args) {
    var args0 = _.toArray(args);

    args0.unshift(this.actorString);

    return args0;
  }
}

module.exports = ActorLogger;