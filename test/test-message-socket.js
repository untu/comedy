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

      serverMessageSocket.on('message', msg => {
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

  it('should correctly receive 1 message in 2 chunks');

  it('should correctly receive 2 messages in 3 chunks');
});