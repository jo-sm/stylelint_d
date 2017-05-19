#!/usr/bin/env node

var minimist = require('minimist');
var net = require('net');
var spawn = require('child_process').spawn;

var packageJson = require('../package.json');
var utils = require('../lib/utils');
var separator = utils.separator;
var generateError = utils.generateError;
var validCommand = utils.validCommand;

var args = minimist(process.argv.slice(2));

function separateData(pieces) {
  return pieces.join('').split(separator).filter(function(i) {
    return Boolean(i.trim());
  });
}

// If version, show current package.json version
if (args.version || args.v) {
  console.log(packageJson.version);
  return;
}

var stdin = '';
var filename = args.file || args.f;
var config = args.config || args.c;

if (!args.formatter) {
  args.formatter = 'string';
}

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
  var format = args.formatter;

  // Start or return server connection
  getServerConn().then(function(conn) {
    // If it's a start command, we handle it here
    if (command === 'start') {
      // The server has already started by virtue of getServerConn
      console.log('stylelint_d started.');
      conn.end();
      return;
    }

    var data = [];

    // We write both the cwd and the potential filename, in
    // case we are given a relative path
    conn.write(JSON.stringify([ process.cwd(), args ]) + separator);
    conn.on('data', function(d) {
      data.push(d.toString('utf8'));
    });

    conn.on('end', function() {
      data = separateData(data);

      // If we were given a command, first try to parse the
      // resulting data in case it is a server message, and
      // if it is, print that.
      var message;

      if (validCommand(command)) {
        try {
          message = JSON.parse(data.join(''));

          if (message.message) {
            console.log(message.message);
          }
        } catch(e) {
          console.log('Could not parse JSON after ended:');
          console.log(e);
        }

        return;
      }

      if (format === 'string') {
        var result = data.join('');

        try {
          console.log(JSON.parse(result));
        } catch(e) {
          console.log('Error: Could not parse `stylelint_d` result');
          console.error(e);
        }
      } else {
        var parsedData = data.reduce(function(memo, i) {
          if (i === 'stylelint_d: start') {
            memo.start = true;
          } else if (i === 'stylelint_d: deprecations') {
            memo.currentType = 'deprecations';
          } else if (i === 'stylelint_d: invalidOptionWarnings') {
            memo.currentType = 'invalidOptionWarnings';
          } else if (i === 'stylelint_d: warnings') {
            memo.currentType = 'warnings';
          } else if (memo.start) {
            memo.start = false;
            memo.currentIndex++;
            memo.outputs.push({
              source: i,
              deprecations: [],
              invalidOptionWarnings: [],
              warnings: []
            });
          } else if (i) {
            try {
              i = JSON.parse(i);
            } catch(e) {
              console.log(i);
              throw new Error('Could not parse Stylelint JSON.');
            }

            memo.outputs[memo.currentIndex][memo.currentType].push(i);
          }

          return memo;
        }, {
          start: false,
          currentIndex: -1,
          currentType: 'deprecations',
          outputs: []
        });

        console.log(JSON.stringify(parsedData.outputs));
      }
    });
  }).catch(function(err) {
    console.log(generateError(err));
  });
}

function getServerConn() {
  var promise = new Promise(function(resolve, reject) {
    // Make sure the socket can be connected to
    var socket = new net.Socket({});

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
      waitForSocket().then(function(actualSocket) {
        resolve(actualSocket);
      }).catch(reject);
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
      var socket = new net.Socket({});

      socket.once('error', wait);

      socket.once('connect', function() {
        resolve(socket);
      });

      socket.connect({ port: 48126, host: '127.0.0.1' });
    };

    wait();
  });
}
