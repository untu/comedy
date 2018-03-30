/*
 * Copyright (c) 2016-2017 Untu, Inc.
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
   * @param {Logger} parentLogger Logger object to take configuration from.
   * @param {Actor} actor Owning actor.
   * @param {String} category Logger category name.
   */
  constructor(parentLogger, actor, category) {
    super(parentLogger.level, category, parentLogger.configuration);
    
    this.actorString = actor.toString() + ':';
  }
  
  beforeLog(args) {
    var args0 = _.toArray(args);

    args0.unshift(this.actorString);

    return args0;
  }
}

module.exports = ActorLogger;