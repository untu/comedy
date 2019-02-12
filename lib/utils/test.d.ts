/*
 * Copyright (c) 2016-2018 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */
import * as P from 'bluebird';

export function logStub(): Object;

export function waitForCondition(condition: any, deadline?: number, checkPeriod?: number): P<any>;
