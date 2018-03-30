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
 * Configuration object wrapped into event emitter.
 * 
 * @class LoggerConfiguration
 */
class LoggerConfiguration extends EventEmitter {
  /**
   * @param {Object} configuration Configuration object.
   */
  constructor(configuration) {
    super();
    this.last = configuration;
    this.setMaxListeners(200);
    this.on('configChange', configuration => this.last = configuration);
  }
}

/**
 * Optimized log wrapper over Winston.
 */
class Logger {
  /**
   * @param {Number} [level=logLevels.Info] Initial logging level.
   * @param {String} [category='Default'] Initial category name.
   * @param {LoggerConfiguration} configuration Configuration object.
   */
  constructor(level = logLevels.Info, category = 'Default', configuration) {
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

    this.category = category;
    this.level = level;

    if (configuration instanceof LoggerConfiguration) {
      this.configuration = configuration;
      this.configuration.on('configChange', this._updateLogLevel.bind(this));
    }
  }

  /**
   * Initializes configuration emitter from provided path file and creates new logger instance subscribed to it.
   * 
   * @param {String} path Path to logger configuration file.
   * @param {String} [category='Default'] Logger category.
   * @returns {Logger} Logger instance.
   */
  static fromConfigurationFile(path, category = 'Default') {
    let configuration;
    let level;

    try {
      const data = fs.readFileSync(path);

      configuration = new LoggerConfiguration(JSON.parse(data));
      level = logLevels[configuration.last[category]];
      console.log(`Reading logger config from ${path}: ${data}`);
    }
    catch (error) {
      console.log(`Unable to read logger config from ${path
      }. Will default to Info log level if case it is not specified explicitly in any available way.`);
    }

    fs.watchFile(path, (eventType) => {
      fs.readFile(path, (err, data) => {
        if (err) {
          return;
        }

        configuration.emit('configChange', JSON.parse(data));
      });
    });

    return new Logger(level, category, configuration);
  }

  /**
   * Creates child logger that inherits configuration object from the specified logger instance.
   * 
   * @param {Logger} parentLogger Logger object to take configuration from.
   * @param {String} [category='Default'] Logger category.
   * @returns {Logger} Logger instance.
   */
  static createChildLogger(parentLogger, category = 'Default') {
    const configuration = parentLogger.configuration;
    let level;

    if (configuration.last instanceof Object) {
      level = logLevels[parentLogger.configuration.last[category]];
    }

    return new Logger(level, category, configuration);
  }

  /**
   * Updates log level value with value from config object provided.
   *
   * @param {Object} config JSON object with logger config options.
   * @private
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

module.exports = Logger;