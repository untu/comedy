/*
 * Copyright (c) 2016-2017 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

let MessageSocket = require('../lib/net/message-socket.js');
let net = require('net');
let expect = require('chai').expect;
let P = require('bluebird');
let _ = require('underscore');

let server;
let client;

describe('MessageSocket', function() {
  afterEach(() => {
    let clientP = P.resolve();
    let serverP = P.resolve();

    if (client) {
      clientP = P.fromCallback(cb => client.end(cb));
    }

    if (server) {
      serverP = P.fromCallback(cb => server.close(cb));
    }

    return P.join(clientP, serverP);
  });

  it('should correctly receive 1 message in 1 chunk', done => {
    server = net.createServer(socket => {
      let serverMessageSocket = new MessageSocket(socket);

      serverMessageSocket.once('message', msg => {
        expect(msg).to.be.deep.equal({ text: 'Hello world!' });

        done();
      });
    });

    server.listen(6363);
    server.on('error', done);

    client = net.createConnection(6363, () => {
      let clientMessageSocket = new MessageSocket(client);

      clientMessageSocket.send({ text: 'Hello world!' });
    });
    client.on('error', done);
  });

  it('should correctly receive 1 message in 2 chunks', done => {
    server = net.createServer(socket => {
      let serverMessageSocket = new MessageSocket(socket);

      serverMessageSocket.once('message', msg => {
        expect(msg).to.be.deep.equal({ text: 'Hello world!' });

        done();
      });
    });

    server.listen(6363);
    server.on('error', done);

    client = net.createConnection(6363, () => {
      let clientMessageSocket = new MessageSocket(client);
      let packet = clientMessageSocket.makePacket({ text: 'Hello world!' });
      let chunks = splitBuffer(packet, 2);

      _.each(chunks, chunk => client.write(chunk));
    });
    client.on('error', done);
  });

  it('should correctly receive 2 messages in 3 chunks', done => {
    server = net.createServer(socket => {
      let serverMessageSocket = new MessageSocket(socket);

      serverMessageSocket.once('message', msg => {
        expect(msg).to.be.deep.equal({ text: 'Sun is shining!' });

        serverMessageSocket.once('message', msg => {
          expect(msg).to.be.deep.equal({ text: 'The weather is sweet!' });

          done();
        });
      });
    });

    server.listen(6363);
    server.on('error', done);

    client = net.createConnection(6363, () => {
      let clientMessageSocket = new MessageSocket(client);
      let packet1 = clientMessageSocket.makePacket({ text: 'Sun is shining!' });
      let packet2 = clientMessageSocket.makePacket({ text: 'The weather is sweet!' });
      let jointPacket = Buffer.concat([packet1, packet2]);
      let chunks = splitBuffer(jointPacket, 3);

      _.each(chunks, chunk => client.write(chunk));
    });
    client.on('error', done);
  });
});

/**
 * Splits a given buffer into a given number of chunks
 * with nearly equal length.
 *
 * @param {Buffer} buf Buffer to split.
 * @param {Number} nChunks Number of chunks.
 * @returns {Buffer[]} Array of resulting chunks.
 */
function splitBuffer(buf, nChunks) {
  let chunkLength = Math.trunc(buf.length, nChunks);
  let lastChunkLength = chunkLength + buf.length % nChunks;

  return _.times(nChunks, i => {
    let len = i == buf.length - 1 ? lastChunkLength : chunkLength;
    let chunk = Buffer.alloc(len);
    buf.copy(chunk, 0, chunkLength * i, len);

    return buf;
  });
}