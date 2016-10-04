'use strict';

var winston = require('winston'); // Logging.
var _ = require('underscore');

/**
 * Debug levels.
 */
var debugLevels = {
  Debug: 1,
  Info: 2,
  Warn: 3,
  Error: 4,
  Silent: 5
};

/**
 * Optimized log wrapper over Winston.
 */
class Logger {
  /**
   * @param {Logger} [log] Wrapped logger. If not specified, a default Winston logger will be created.
   */
  constructor(log) {
    this.log = log || new (winston.Logger)({
      transports: [
        new (winston.transports.Console)({
          level: 'debug', // Set lowest debug level, manage log level outside.
          colorize: false,
          prettyPrint: true,
          timestamp: function() {
            return new Date();
          }
        })
      ]
    });
    this.level = log && log.getLevel && log.getLevel() || debugLevels.Info;
  }

  /**
   * Creates and returns a silent logger - a logger that logs nothing.
   *
   * @returns {Logger} Silent logger.
   */
  static silent() {
    var logger = new Logger();

    logger.setLevel(debugLevels.Silent);

    return logger;
  }

  /**
   * Returns possible log levels.
   *
   * @returns {Object} Log levels enumeration.
   */
  levels() {
    return _.clone(debugLevels);
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
    return this.level <= debugLevels.Debug;
  }

  /**
   * Writes debug message to log.
   */
  debug() {
    if (this.level <= debugLevels.Debug) {
      this.log.debug.apply(this.log, this.beforeLog(arguments));
    }
  }

  /**
   * Writes info message to log.
   */
  info() {
    if (this.level <= debugLevels.Info) {
      this.log.info.apply(this.log, this.beforeLog(arguments));
    }
  }

  /**
   * Writes warning message to log.
   */
  warn() {
    if (this.level <= debugLevels.Warn) {
      this.log.warn.apply(this.log, this.beforeLog(arguments));
    }
  }

  /**
   * Writes error message to log.
   */
  error() {
    if (this.level <= debugLevels.Error) {
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