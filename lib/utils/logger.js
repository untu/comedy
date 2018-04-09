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
const P = require('bluebird');

P.promisifyAll(fs);

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
    this.current = configuration;
    this.setMaxListeners(200);
  }

  /**
   * Create LoggerConfiguration instance with configuration details taken from files on local machine.
   *
   * @param {String[]} paths Paths to logger configuration files.
   * @returns {(LoggerConfiguration | undefined)} Logger configuration instance.
   */
  static fromFiles(paths = []) {
    let configuration;
    let data = {};

    paths.forEach(path => {
      try {
        const loggerConf = fs.readFileSync(path);

        data = _.mapObject(JSON.parse(loggerConf), function(val, key) {
          return _.extend(val, data[key]);
        });
        console.log(`Reading logger configuration from ${path}: ${loggerConf}`);
      }
      catch (error) {
        console.log('Unable to read logger config from ' + path +
          '. Will default to Info log level in case it is not specified explicitly in any available way.');
      }
    });

    configuration = new LoggerConfiguration(data);

    paths.forEach(path => {
      // When any of the configuration files changes
      fs.watchFile(path, curStats => {
        if (!curStats.isFile()) return;

        // Read all configuration files and combine them into new configuration object.
        P
          .map(paths, path0 => fs.readFileAsync(path0)
            .catch(error => {
              console.log('Unable to read logger config from ' + path0 +
                '. Will default to Info log level in case it is not specified explicitly in any available way.');
            })
          )
          .then(
            // NOTE: using filter(...) here to get rid of 'undefined' values from failed readFileAsync() operations
            results => results.filter(val => val).reduce((acc, cur) => {
              try {
                acc = _.mapObject(JSON.parse(cur), (val, key) => _.extend(val, acc[key]));
              }
              catch (error) {
                console.log(`Error handling logger configuration data: ${cur}`);
              }

              return acc;
            }, {}),
            error => console.log(`Unable to update logger configuration. Reason: ${error}`)
          )
          .then(data => configuration._setConfiguration(data));
      });
    });

    return configuration;
  }

  /**
   * Set provided configuration object to the current instance.
   *
   * @param {Object} data Configuration object.
   * @private
   */
  _setConfiguration(data) {
    this.current = data;
    this.emit('configChange', this);
  }

  /**
   * Get log level for the specified logger category.
   *
   * @param {String} category Logger category name.
   * @returns {(String | undefined)} Log level name.
   */
  getLevel(category) {
    if (typeof this.current.categories !== 'object') return;

    return this.current.categories[category];
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
   * Creates new logger with configuration from given configuration file (or files). Changes in
   * configuration file(s) are applied immediately on the run.
   *
   * @param {String|String[]} path Path (or paths) to logger configuration file(s).
   * @param {String} [category='Default'] Logger category.
   * @returns {Logger} Logger instance.
   */
  static fromConfigurationFile(path, category = 'Default') {
    const configuration = LoggerConfiguration.fromFiles(_.isArray(path) ? path : [path]);

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

module.exports = Logger;