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
    var command = chunk.toString('utf8').trim();

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

    // We assume that we're given either a file or a glob, so we look for the last slash
    // remove whatever is at the end, and change to that dir
    var folderGlob = glob(command);
    var folder = folderGlob.minimatch.set[0].reduce(function(memo, i) {
      if (typeof i === 'string') {
        memo.push(i);
      } 

      return memo; 
    }, []).join('/');

    // Use glob/file folder as current dir
    process.chdir(path.dirname(folder));

    linter({ files: command })
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