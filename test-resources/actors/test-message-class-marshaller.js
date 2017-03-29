/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

/**
 * Test module-based marshaller for TestMessageClass message type.
 */
class TestMessageClassMarshaller {
  getType() {
    return 'TestMessageClass';
  }

  marshall(msg) {
    return { pid: msg.pid };
  }

  unmarshall(msg) {
    return {
      getPid: () => msg.pid
    };
  }
}

module.exports = TestMessageClassMarshaller;