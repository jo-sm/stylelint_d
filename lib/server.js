var child_process = require('child_process');
var fs = require('fs');
var net = require('net');
var path = require('path');
var resolve = require('resolve');

var glob = require('glob');

startServer();

function startServer() {
  var server = createServer(connHandler);

  server.listen(48126, '127.0.0.1');

  // Bind new listeners to current server
  process.removeAllListeners();
  process.on('SIGTERM', endServer(server));
  process.on('SIGINT', endServer(server));
}

function endServer(server) {
  return function() {
    server.close();
    process.exit();
  }
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

    var raw = splitData[0].trim();

    // We shouldn't get invalid JSON, but just in case...
    try {
      rawOpts = JSON.parse(raw);
    } catch(e) {
      conn.write(new Error('Invalid command'));
      conn.end();
      return;
    }

    var cwd = rawOpts[0];
    var args = rawOpts[1];
    var command = args._[0];
    var files = args.files;

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

    var formatter = args.formatter ? args.formatter : 'string';
    var lintOpts = { formatter: formatter };
    var folder;
    var config = args.config || args.c;

    if (config) {
      // If there is a config given, use that first
      if (!path.isAbsolute(config)) {
        config = path.resolve(cwd, config);
      }

      lintOpts.configFile = config;
      folder = path.dirname(config);
    } else {
      // If no config is given, use the file parameter to determine where to change process directory to

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
      folder = folderGlob.minimatch.set[0].reduce(function(memo, i) {
        if (typeof i === 'string') {
          memo.push(i);
        }

        return memo;
      }, []).join('/');
      folder = path.dirname(folder)

      // Use glob/file folder as current dir
      // Note this may cause issues if given an expanded file glob in which
      // the directories contain multiple configs (I think this is also a bug
      // in stylelint)
      process.chdir(folder);
    }

    // Import the linter dynamically based on the folder of the config or CSS file
    var linterPath;

    // If the module cannot be resolved at the given path, it will throw an error
    // In that case, use the `stylelint_d` `stylelint` module
    try {
      linterPath = resolve.sync('stylelint', { basedir: folder });
    } catch(e) {
      linterPath = resolve.sync('stylelint');
    }

    var linter = require(linterPath).lint;

    // "You must pass stylelint a `files` glob or a `code` string, though not both"
    if (args.stdin) {
      folder = files[0];
      lintOpts.code = args.stdin;
    } else {
      lintOpts.files = files;
    }

    linter(lintOpts)
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