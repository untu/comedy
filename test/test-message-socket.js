/*
 * Copyright (c) 2016 Untu, Inc.
 * This code is licensed under Eclipse Public License - v 1.0.
 * The full license text can be found in LICENSE.txt file and
 * on the Eclipse official site (https://www.eclipse.org/legal/epl-v10.html).
 */

'use strict';

var MessageSocket = require('../lib/net/message-socket.js');
var net = require('net');
var expect = require('chai').expect;
var P = require('bluebird');
var _ = require('underscore');

var server;
var client;

describe('MessageSocket', function() {
  afterEach(() => {
    var clientP = P.resolve();
    var serverP = P.resolve();

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
      var serverMessageSocket = new MessageSocket(socket);

      serverMessageSocket.once('message', msg => {
        expect(msg).to.be.deep.equal({ text: 'Hello world!' });

        done();
      });
    });

    server.listen(6363);
    server.on('error', done);

    client = net.createConnection(6363, () => {
      var clientMessageSocket = new MessageSocket(client);

      clientMessageSocket.send({ text: 'Hello world!' });
    });
    client.on('error', done);
  });

  it('should correctly receive 1 message in 2 chunks', done => {
    server = net.createServer(socket => {
      var serverMessageSocket = new MessageSocket(socket);

      serverMessageSocket.once('message', msg => {
        expect(msg).to.be.deep.equal({ text: 'Hello world!' });

        done();
      });
    });

    server.listen(6363);
    server.on('error', done);

    client = net.createConnection(6363, () => {
      var clientMessageSocket = new MessageSocket(client);
      var packet = clientMessageSocket.makePacket({ text: 'Hello world!' });
      var chunks = splitBuffer(packet, 2);

      _.each(chunks, chunk => client.write(chunk));
    });
    client.on('error', done);
  });

  it('should correctly receive 2 messages in 3 chunks');
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
  var chunkLength = Math.trunc(buf.length, nChunks);
  var lastChunkLength = chunkLength + buf.length % nChunks;

  return _.times(nChunks, i => {
    var len = i == buf.length - 1 ? lastChunkLength : chunkLength;
    var chunk = Buffer.alloc(len);
    buf.copy(chunk, 0, chunkLength * i, len);

    return buf;
  });
}