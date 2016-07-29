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
  var data = [];

  conn.on('data', function(chunk) {
    data.push(chunk.toString('utf8'));

    var rawData = data.join('');
    if (!rawData.indexOf("\r\n")) {
      return;
    }

    var splitData = rawData.split("\r\n")
    data = [ splitData[1] ];

    var rawCommand = splitData[0].trim();

    // We shouldn't get invalid JSON, but just in case...
    try {
      rawCommand = JSON.parse(rawCommand);
    } catch(e) {
      conn.write(new Error('Invalid command'));
      conn.end();
      return;
    }

    var cwd = rawCommand[0];
    var files = rawCommand[1];
    var command = files[0]; // This could be a command

    if (command === 'stop') {
      conn.end('stylelint_d stopped');
      conn.server.close();
      return;
    }

    if (command === 'restart') {
      conn.end('stylelint_d restarting');
      conn.server.close();
      startServer();
      return;
    }

    // Test to see if the file is an absolute path
    // If not, use the cwd of the stylelint_d executable
    if (!path.isAbsolute(files[0])) {
      files = files.map(function(file) {
        return path.resolve(cwd, file);
      });
    }

    // Look at the first file, see if it's a glob, and return the possible
    // folder name
    var folderGlob = glob(files[0]);
    var folder = folderGlob.minimatch.set[0].reduce(function(memo, i) {
      if (typeof i === 'string') {
        memo.push(i);
      } 

      return memo; 
    }, []).join('/');

    // Use glob/file folder as current dir
    // Note this may cause issues if given an expanded file glob in which
    // the directories contain multiple configs (I think this is also a bug
    // in stylelint)
    process.chdir(path.dirname(folder));

    linter({ files: files, formatter: "string" })
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
