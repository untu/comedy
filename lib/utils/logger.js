/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let winston = require('winston'); // Logging.
let _ = require('underscore');
let common = require('./common.js');
const EventEmitter = require('events');
const fs = require('fs');
const P = require('bluebird');

P.promisifyAll(fs);

/**
 * Log levels.
 */
let logLevels = {
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
    this._setConfiguration(configuration);
    this.setMaxListeners(200);
  }

  /**
   * Creates LoggerConfiguration instance with configuration specified by a given
   * data object.
   *
   * @param {Object} obj Data object with logger configuration.
   * @param {Logger} [log] Logger.
   * @returns {LoggerConfiguration} Logger configuration instance.
   */
  static fromObject(obj, log) {
    let configuration = new LoggerConfiguration(obj);

    log && log.info('Logger configuration:', configuration.toString());

    return configuration;
  }

  /**
   * Creates LoggerConfiguration instance with configuration taken from given files.
   *
   * @param {String[]} paths Paths to logger configuration files.
   * @param {Logger} log Temporary logger to output errors.
   * @returns {(LoggerConfiguration | undefined)} Logger configuration instance.
   */
  static fromFiles(paths = [], log) {
    log.info('Reading logger configuration from file(s):', paths);

    let data = _.reduce(paths, (memo, path) => {
      try {
        let loggerConf = fs.readFileSync(path);

        memo = common.deepExtend(JSON.parse(loggerConf), memo);
      }
      catch (err) {
        log.warn('Unable to read logger configuration, path=' + path + ', error=' + err.message);
      }

      return memo;
    }, {});

    let configuration = new LoggerConfiguration(data);

    paths.forEach(path => {
      // When any of the configuration files changes
      fs.watchFile(path, curStats => {
        log.info('Logger configuration file changed, re-reading configuration...');

        // Read all configuration files and combine them into new configuration object.
        P
          .map(paths, path0 => {
            return fs.readFileAsync(path0)
              .then(data => {
                try {
                  return JSON.parse(data);
                }
                catch (err) {
                  log.warn(
                    `Failed to parse configuration from file (will ignore), path=${path0}, error=${err.message}`);
                }
              })
              .catch(err => {
                log.warn(`Unable to read logger configuration (will ignore), path=${path0}, error=${err.message}`);
              });
          })
          .then(configs => {
            let data = _.compact(configs).reduce((memo, cur) => common.deepExtend(cur, memo), {});

            configuration._setConfiguration(data);

            log.info('Updated logger configuration:', configuration.toString());
          });
      });
    });

    log.info('Resulting logger configuration:', configuration.toString());

    return configuration;
  }

  /**
   * Sets provided configuration object to the current instance.
   *
   * @param {Object} data Configuration object.
   * @private
   * @throws {Error} Validation error.
   */
  _setConfiguration(data) {
    this.current = data;

    // Set default configuration if data is invalid.
    if (!this.current || typeof this.current.categories !== 'object') {
      this.current = _.extend(this.current, { categories: { 'Default': 'Info' } });
    }

    this.emit('configChange', this);
  }

  /**
   * Gets log level for the specified logger category.
   *
   * @param {String} category Logger category name.
   * @returns {(String|undefined)} Log level name.
   */
  getLevel(category) {
    return this.current.categories[category] || this.current.categories['Default'];
  }

  toString() {
    return this.current && JSON.stringify(this.current, null, 2) || '';
  }
}

/**
 * Optimized log wrapper over Winston.
 */
class Logger {
  /**
   * @param {Number} [level=logLevels.Info] Initial logging level.
   * @param {String} [category='Default'] Initial category name.
   * @param {LoggerConfiguration|undefined} [configuration] Logger configuration instance.
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

    if (configuration) {
      this.configuration = configuration;
      // Try to get log level from configuration provided
      this.level = logLevels[configuration.getLevel(this.category)] ||
        logLevels[configuration.getLevel('Default')] ||
        this.level;
      this.configuration.on('configChange', this._updateLogLevel.bind(this));
    }
  }

  /**
   * Creates new logger with configuration from a given data object.
   *
   * @param {Object} obj Configuration object.
   * @param {String} [category] Logger category.
   * @param {Boolean} [printConfig] Whether to print logger configuration.
   * @returns {Logger} Logger instance.
   */
  static fromConfigurationObject(obj = {}, category = 'Default', printConfig = true) {
    return new Logger(
      undefined,
      category,
      LoggerConfiguration.fromObject(obj, printConfig ? new Logger() : undefined));
  }

  /**
   * Creates new logger with configuration from given configuration file (or files). Changes in
   * configuration file(s) are applied immediately on the run.
   *
   * @param {String|String[]} path Path (or paths) to logger configuration file(s).
   * @param {String} [category='Default'] Logger category.
   * @returns {Logger} Logger instance.
   */
  static fromConfigurationFile(path = [], category = 'Default') {
    let configuration;

    if (!_.isEmpty(path)) {
      configuration = LoggerConfiguration.fromFiles(_.isArray(path) ? path : [path], new Logger());
    }

    return new Logger(undefined, category, configuration);
  }

  /**
   * Updates log level value with value from config object provided.
   *
   * @param {LoggerConfiguration} configuration Logger configuration instance.
   * @private
   */
  _updateLogLevel(configuration) {
    this.level = logLevels[configuration.getLevel(this.category)] ||
      logLevels[configuration.getLevel('Default')] ||
      this.level;
  }

  /**
   * Creates and returns a silent logger - a logger that logs nothing.
   *
   * @returns {Logger} Silent logger.
   */
  static silent() {
    let logger = new Logger();

    logger.setLevel(logLevels.Silent);

    return logger;
  }

  /**
   * Sets logger internal implementation.
   *
   * @param {Object} impl Logger implementation.
   */
  setImplementation(impl) {
    // Check implementation for required methods.
    _.each(['error', 'warn', 'info', 'debug'], method => {
      if (!_.isFunction(impl[method])) {
        throw new Error(`Logger implementation should contain "${method}" method.`);
      }
    });

    this.log = impl;
  }

  /**
   * @returns {Object} Current logger implementation.
   */
  getImplementation() {
    return this.log;
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
    
    if (this.configuration) {
      this.configuration.removeListener('configChange', this._updateLogLevel);
    }
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
   * Get logger configuration instance.
   *
   * @returns {(LoggerConfiguration | undefined)} Logger configuration.
   */
  getConfiguration() {
    return this.configuration;
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

module.exports = { Logger, logLevels };