/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var winston = require('winston'); // Logging.
var _ = require('underscore');
const EventEmitter = require('events');
const fs = require('fs');

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
   * @param {Number} [category] Initial category name.
   */
  constructor(level, category) {
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

    // this.level = level || logLevels.Info;
    this.category = category || 'Default';

    // if (Logger.config$ instanceof EventEmitter) {
      // Redefine log level to config value if available
      this.level = logLevels[Logger.config$.last[this.category]] || level || logLevels.Info;
      Logger.config$.on('configChange', this._configListener.bind(this));
    // }
  }

  /**
   * Subscribe to categories config.
   * 
   * @param {String} pathToConf Path to logger configuration file.
   */
  static subscribeConf(pathToConf) {
    try {
      const data = fs.readFileSync(pathToConf);

      Logger.config$.emit('configChange', JSON.parse(data));
    } catch (error) { }

    fs.watchFile(pathToConf, (eventType) => {
      // if (eventType === 'change') {
        fs.readFile(pathToConf, (err, data) => {
          if (err) {
            return;
          }

          Logger.config$.emit('configChange', JSON.parse(data));
        });
      // }
    });
  }

  _configListener(config) {
    const newLevel = logLevels[config[this.category]];
  
    // NOTE: this is especially usefull in case of default category log level not specified in the config file.
    // In that case default log level will be taken from a parameter passed in to constructor.
    if (typeof newLevel === 'undefined') {
      return;
    }

    if (newLevel !== this.level) {
      this.level = newLevel;
    }
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
   * Sets logger category name for this logger.
   *
   * @param {String} category Category name.
   */
  setCategory(category) {
    this.category = category;
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
    // this.level = level;
    // Logger.config$.removeListener('configChange', this._configListener);
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

Logger.config$ = (() => {
  const configEmitter = new EventEmitter();

  // Store the last config snapshot to be able to access it directly at any time
  configEmitter.last = [];
  configEmitter
    .setMaxListeners(200)
    .on('configChange', (config) => {
      configEmitter.last = config;
    });

  return configEmitter;
})();

module.exports = Logger;