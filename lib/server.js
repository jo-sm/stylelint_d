var child_process = require('child_process');
var fs = require('fs');
var net = require('net');
var path = require('path');

var glob = require('glob');
var linter = require('stylelint').lint;

var SOCKET_FILE = '/tmp/stylelint_d.sock';

fs.stat(SOCKET_FILE, function(err) {
  if (!err) {
    fs.unlinkSync(SOCKET_FILE);
  }

  startServer();
})

function startServer() {
  var server = createServer(connHandler);

  server.listen(SOCKET_FILE, function() {
    fs.chmod(SOCKET_FILE, 0777)
  });
}

function createServer(handler) {
  var server = net.createServer(handler);

  return server;
}

function connHandler(conn) {
  conn.on('data', function(chunk) {
    var raw_command = chunk.toString('utf8').trim();

    // We shouldn't get invalid JSON, but just in case...
    try {
      raw_command = JSON.parse(raw_command);
    } catch(e) {
      conn.write(new Error('Invalid command'));
      conn.end();
      return;
    }

    var cwd = raw_command[0];
    var command = raw_command[1];

    if (command === 'stop') {
      conn.end('stopped');
      conn.server.close();
      return;
    }

    if (command === 'restart') {
      conn.end('restarting');
      conn.server.close();
      startServer();
      return;
    }

    // Test to see if the file is an absolute path
    // If not, use the cwd of the stylelint_d executable
    var filename;

    if (!path.isAbsolute(command)) {
      filename = path.resolve(cwd, command);
    } else {
      filename = command;
    }

    // We assume that we're given either a file or a glob, so we look for the last slash
    // remove whatever is at the end, and change to that dir
    var folderGlob = glob(filename);
    var folder = folderGlob.minimatch.set[0].reduce(function(memo, i) {
      if (typeof i === 'string') {
        memo.push(i);
      } 

      return memo; 
    }, []).join('/');

    // Use glob/file folder as current dir
    process.chdir(path.dirname(folder));

    linter({ files: filename, formatter: "string" })
      .then(function(data) {
        conn.write(JSON.stringify(data));
      })
      .catch(function(error) {
        conn.write(error.toString());
      })
      .then(function() {
        // Close the connection at the end
        conn.end();
      });
  });
}

process.on('SIGTERM', function() {
  process.exit();
});

process.on('SIGINT', function() {
  process.exit();
});