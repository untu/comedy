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

    this.category = category || 'Default';
    this.level = logLevels[Logger.config$.last[this.category]] || // get level for current category from config
      logLevels[Logger.config$.last['Default']] || // or get level for Default category from config
      level || // or get level passed to the constructor
      logLevels.Info; // or set level as Info by default
    Logger.config$.on('configChange', this._updateLogLevel.bind(this));
  }

  /**
   * Subscribes to categories config.
   * 
   * @param {String} pathToConfig Path to logger configuration file.
   */
  static subscribeConfig(pathToConfig) {
    try {
      const data = fs.readFileSync(pathToConfig);

      Logger.config$.emit('configChange', JSON.parse(data));
      console.log(`Reading logger config from ${pathToConfig}: ${data}`);
      fs.watchFile(pathToConfig, (eventType) => {
        fs.readFile(pathToConfig, (err, data) => {
          if (err) {
            return;
          }
  
          Logger.config$.emit('configChange', JSON.parse(data));
        });
      });
    } catch (error) {
      console.log(`Unable to read logger config from ${pathToConfig
      }. Will default to Info log level if case it is not specified explicitly in any available way.`);
    }
  }

  /**
   * Updates log level value with value from config object provided.
   *
   * @private
   * @param {any} config JSON object with logger config options.
   */
  _updateLogLevel(config) {
    this.level = logLevels[config[this.category]] || logLevels[config['Default']] || this.level;
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
    this.level = level;
    Logger.config$.removeListener('configChange', this._updateLogLevel);
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