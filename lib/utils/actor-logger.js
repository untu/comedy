/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var Logger = require('./logger.js');
var _ = require('underscore');

/**
 * Logger for a particular actor. Prefixes all messages with actor name.
 */
class ActorLogger extends Logger {
  /**
   * @param {Logger} log Wrapped logger.
   * @param {Actor} actor Owning actor.
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