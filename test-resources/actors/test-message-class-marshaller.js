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