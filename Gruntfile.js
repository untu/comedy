/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    // ESLint code validation.
    eslint: {
      options: {
        maxWarnings: 0
      },
      target: [
        '**/*.js',
        '!**/node_modules/**',
        '!coverage/**'
      ]
    },
    // TSLint code validation.
    tslint: {
      options: {
        maxWarnings: 0
      },
      target: [
        '**/*.ts',
        '!**/node_modules/**'
      ]
    }
  });

  // Validate task.
  grunt.registerTask('validate', ['eslint', 'tslint']);
  // Default task.
  grunt.registerTask('default', ['validate']);
};
