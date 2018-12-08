/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

/**
 * A test logger implementation.
 */
class TestLogger {
  constructor() {
    this.loggerMessages = {
      error: [],
      warn: [],
      info: [],
      debug: []
    };
  }

  getLoggerMessages() {
    return this.loggerMessages;
  }

  error(...msg) {
    this.loggerMessages.error.push(msg);
  }

  warn(...msg) {
    this.loggerMessages.warn.push(msg);
  }

  info(...msg) {
    this.loggerMessages.info.push(msg);
  }

  debug(...msg) {
    this.loggerMessages.debug.push(msg);
  }
}

module.exports = TestLogger;