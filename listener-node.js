/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

#!/usr/bin/env node

'use strict';

var actors = require('./index.js');

var system = actors();

system.listen(process.argv[2], process.argv[3]);