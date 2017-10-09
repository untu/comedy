/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var winston = require('winston'); // Logging.
var _ = require('underscore');

/**
 * Log levels.
 */
var logLevels = {
  Silent: 1,
  Error: 2,
  Warn: 3,
  Info: 4,
  Debug: 5
};

/**
 * Optimized log wrapper over Winston.
 */
class Logger {
  /**
   * @param {Number} [level] Initial logging level.
   */
  constructor(level) {
    this.log = new (winston.Logger)({
      transports: [
        new (winston.transports.Console)({
          level: 'debug', // Set lowest debug level, manage log level outside.
          stderrLevels: ['error'],
          colorize: false,
          prettyPrint: true,
          timestamp: function() {
            return new Date();
          }
        })
      ]
    });
    this.level = level || logLevels.Info;
  }

  /**
   * Creates and returns a silent logger - a logger that logs nothing.
   *
   * @returns {Logger} Silent logger.
   */
  static silent() {
    var logger = new Logger();

    logger.setLevel(logLevels.Silent);

    return logger;
  }

  /**
   * Returns possible log levels.
   *
   * @returns {Object} Log levels enumeration.
   */
  levels() {
    return _.clone(logLevels);
  }

  /**
   * Sets log level for this logger.
   *
   * @param {Number} level Log level.
   */
  setLevel(level) {
    this.level = level;
  }

  /**
   * Gets current log level for this logger.
   *
   * @returns {Number} Current log level.
   */
  getLevel() {
    return this.level;
  }

  /**
   * Convenience function for checking if debug log is enabled.
   *
   * @returns {Boolean} True if debug is enabled, false otherwise.
   */
  isDebug() {
    return this.level >= logLevels.Debug;
  }

  /**
   * Writes debug message to log.
   */
  debug() {
    if (this.level >= logLevels.Debug) {
      this.log.debug.apply(this.log, this.beforeLog(arguments));
    }
  }

  /**
   * Writes info message to log.
   */
  info() {
    if (this.level >= logLevels.Info) {
      this.log.info.apply(this.log, this.beforeLog(arguments));
    }
  }

  /**
   * Writes warning message to log.
   */
  warn() {
    if (this.level >= logLevels.Warn) {
      this.log.warn.apply(this.log, this.beforeLog(arguments));
    }
  }

  /**
   * Writes error message to log.
   */
  error() {
    if (this.level >= logLevels.Error) {
      this.log.error.apply(this.log, this.beforeLog(_.map(arguments, arg => {
        // Automatically unwrap errors.
        if (arg instanceof Error) {
          if (arg.isOperational) return arg.message;

          return arg.stack;
        }

        return arg;
      })));
    }
  }

  /**
   * Function for extending log messages in sub-classes.
   *
   * @param {Array} args Original arguments passed to logger.
   * @returns {Array} Modified arguments passed to logger.
   */
  beforeLog(args) {
    return args;
  }
}

module.exports = Logger;