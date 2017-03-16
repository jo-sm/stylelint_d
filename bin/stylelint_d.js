#!/usr/bin/env node

var minimist = require('minimist');
var net = require('net');
var msgpack = require('msgpack');
var spawn = require('child_process').spawn;

var packageJson = require('../package.json');

var args = minimist(process.argv.slice(2));

// If version, show current package.json version
if (args.version || args.v) {
  console.log(packageJson.version);
  return;
}

var stdin = '';
var filename = args.file || args.f;
var config = args.config || args.c;

if (args.stdin) {
  if (!filename && !config) {
    console.log('Error: --stdin requires --config or --file flags');
    return;
  }

  process.stdin.on('readable', function() {
    var chunk = process.stdin.read();

    if (chunk !== null) {
      stdin += chunk;
    }
  });

  process.stdin.on('end', function() {
    args.stdin = stdin;
    args.files = [ filename ];
    lint(args);
  });
} else {
  args.files = args._;
  lint(args);
}

function lint(args) {
  var command = args._[0];

  // Start or return server connection
  getServerConn().then(function(conn) {
    // If it's a start command, we handle it here
    if (command === 'start') {
      // The server has already started by virtue of getServerConn
      console.log('stylelint_d started');
      conn.end();
      return;
    }

    var data = [];

    // We write both the cwd and the potential filename, in
    // case we are given a relative path
    conn.write(JSON.stringify([ process.cwd(), args ]) + "\r\n");
    conn.on('data', function(d) {
      data.push(d);
    });

    conn.on('end', function() {
      var output;

      try {
        output = msgpack.unpack(data.join(''));
        output = output.output;
      } catch(e) {
        output = '';
      }

      console.log(output);
    });
  }).catch(function(err) {
    console.log(err);
  });
}

function getServerConn() {
  var promise = new Promise(function(resolve, reject) {
    // Make sure the socket can be connected to
    var socket = new net.Socket({
      readable: true,
      writeable: true,
      allowHalfOpen: false,
      fd: null
    });

    socket.once('error', function() {
      var server = require.resolve('../lib/server');
      var child = spawn('node', [ server ], {
        detached: true,
        stdio: [ 'ignore', 'ignore', 'ignore' ],
      });
      child.unref();

      // Close this connection
      socket.destroy();

      // Wait for server to spawn and socket to connect
      waitForSocket().then(resolve).catch(reject);
    });

    socket.once('connect', function() {
      resolve(socket);
    });

    socket.connect({ port: 48126, host: '127.0.0.1' });
  });

  return promise;
}

function waitForSocket() {
  return new Promise(function(resolve) {
    var wait = function() {
      var socket = new net.Socket({
        readable: true,
        writeable: true,
        allowHalfOpen: false,
        fd: null
      });

      socket.once('error', wait);

      socket.once('connect', function() {
        resolve(socket);
      });

      socket.connect({ port: 48126, host: '127.0.0.1' });
    };

    wait();
  });
}
