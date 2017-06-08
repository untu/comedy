#!/usr/bin/env node

/*
 * ~ Copyright (c) 2014-2016 ROSSINNO, LTD.
 */

'use strict';

var actors = require('./index.js');

var system = actors();

system.listen();