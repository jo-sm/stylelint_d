var net = require('net');
var path = require('path');
var resolve = require('resolve');
var glob = require('glob');
var utils = require('./utils');
var separator = utils.separator;
var generateError = utils.generateError;

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
  };
}

function createServer(handler) {
  var server = net.createServer(handler);

  return server;
}

function write(conn, message) {
  conn.write(`${message}${separator}`);
}

function serverMessage(text) {
  return {
    message: text
  };
}

function connHandler(conn) {
  var data = [];

  conn.on('data', function(chunk) {
    data.push(chunk.toString('utf8'));

    var rawData = data.join('');

    if (rawData.indexOf(separator) === -1) {
      return;
    }

    var splitData = rawData.split(separator);
    var raw = splitData[0].trim();
    var rawOpts;

    // We shouldn't get invalid JSON, but just in case...
    try {
      rawOpts = JSON.parse(raw);
    } catch(e) {
      conn.write(JSON.stringify(generateError('Invalid data from client.', 'string')));
      conn.end();
      return;
    }

    var cwd = rawOpts[0];
    var args = rawOpts[1];
    var command = args._[0];
    var files = args.files;

    console.info(`Command received: ${command}`);

    if (command === 'stop') {
      write(conn, JSON.stringify(serverMessage('stylelint_d stopped.')));
      conn.end();
      conn.server.close();
      return;
    }

    if (command === 'restart') {
      write(conn, JSON.stringify(serverMessage('stylelint_d restarting.')));
      conn.end();
      conn.server.close();
      startServer();
      return;
    }

    var formatter = args.formatter ? args.formatter : 'string';
    var lintOpts = { formatter: formatter };
    var folder;
    var config = args.config || args.c;

    if (config) {
      console.info('Config flag passed');

      // If there is a config given, use that first
      if (!path.isAbsolute(config)) {
        console.info(`Relative config path given, making absolute to cwd (${cwd})`);
        config = path.resolve(cwd, config);
      }

      lintOpts.configFile = config;
      folder = path.dirname(config);
    } else {
      console.info('No config flag passed');
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

      folder = path.dirname(folder);
    }

    // Import the linter dynamically based on the folder of the config or CSS file
    var linterPath;

    // If the module cannot be resolved at the given path, it will throw an error
    // In that case, use the `stylelint_d` `stylelint` module
    try {
      linterPath = resolve.sync('stylelint', { basedir: folder });
      console.info(`Resolved stylelint in local folder ${folder}`);
    } catch(e) {
      linterPath = resolve.sync('stylelint');
      console.info('Could not resolve stylelint in CSS path, using stylelint_d stylelint module');
    }

    var linter = require(linterPath).lint;

    // "You must pass stylelint a `files` glob or a `code` string, though not both"
    if (args.stdin) {
      console.info('Given stdin');

      folder = files[0];
      lintOpts.code = args.stdin;
    } else {
      console.info(`Given files: ${files}`);

      lintOpts.files = files;
    }

    linter(lintOpts)
      .then(function(data) {
        console.info('Successfully linted. Sending data to client.');
        var result;

        if (formatter === 'string') {
          // If the formatter is a string, we just send the raw output
          // from stylelint, since it's formatted for us already.
          result = JSON.stringify({
            output: data.output,
            errored: data.errored
          });

          write(conn, result);
        } else {
          // To handle large data, we spread out sending the resulting
          // lint data over each of the deprecations, invalidOptionWarnings,
          // and warnings, sending them one at a time, separated by the
          // separator.
          var outputs = data.output;

          try {
            outputs = JSON.parse(outputs);
          } catch(e) {
            throw new Error("Stylelint data was invalid.");
          }

          for (var i in outputs) {
            var output = outputs[i];
            var filename = output.source;
            var deprecations = output.deprecations;
            var invalidOptionWarnings = output.invalidOptionWarnings;
            var warnings = output.warnings;

            write(conn, 'stylelint_d: start');
            write(conn, filename);

            // Send deprecations
            write(conn, 'stylelint_d: deprecations');
            for (var j in deprecations) {
              var deprecation = deprecations[j];

              write(conn, JSON.stringify(deprecation));
            }

            // Send invalidOptionWarnings
            write(conn, "stylelint_d: invalidOptionWarnings");
            for(var k in invalidOptionWarnings) {
              var iow = invalidOptionWarnings[k];

              write(conn, JSON.stringify(iow));
            }

            // Send warnings
            write(conn, "stylelint_d: warnings");
            for(var l in warnings) {
              var warning = warnings[l];

              write(conn, JSON.stringify(warning));
            }

            // Send exit code
            write(conn, "stylelint_d: exitCode");
            if (warnings.length > 0) {
              write(conn, JSON.stringify(2));
            } else {
              write(conn, JSON.stringify(0));
            }
          }
        }
      })
      .catch(function(error) {
        console.info(`Could not lint: ${error}`);

        var errorObject = generateError(error, formatter);
        conn.write(JSON.stringify(errorObject));
      })
      .then(function() {
        // Finally, close the connection
        conn.end();
      });
  });
}
