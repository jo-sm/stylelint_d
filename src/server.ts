import net from "net";
import path from "path";
import resolve from "resolve";
import glob from "glob";
import { LinterResult, LintResult } from "stylelint";

import { separator, generateError } from "./utils";

let server = startServer();

function startServer() {
  const server = net.createServer(connectionListener);

  server.listen(48126, "127.0.0.1");

  process.title = "stylelint_d";
  process.removeAllListeners();
  process.on("SIGTERM", stopServer);
  process.on("SIGINT", stopServer);

  return server;
}

function stopServer() {
  server.close();

  process.exit(0);
}

function write(conn: net.Socket, message: string) {
  conn.write(`${message}${separator}`);
}

function serverMessage(text: string) {
  return {
    message: text,
  };
}

function connectionListener(conn: net.Socket) {
  const data: string[] = [];

  conn.on("data", (chunk) => {
    data.push(chunk.toString("utf8"));

    const rawData = data.join("");

    if (rawData.indexOf(separator) === -1) {
      return;
    }

    const splitData = rawData.split(separator);
    const raw = splitData[0].trim();
    let rawOpts;

    // We shouldn't get invalid JSON, but just in case...
    try {
      rawOpts = JSON.parse(raw);
    } catch (e) {
      conn.write(JSON.stringify(generateError("Invalid data from client", "string")));
      conn.end();
      return;
    }

    const [cwd, args] = rawOpts;
    const command = args.command;
    let files: string[] = args.files;

    console.info(`Command received: ${command}`);

    if (command === "stop") {
      write(conn, JSON.stringify(serverMessage("stylelint_d stopped.")));
      conn.end();
      server.close();
      return;
    }

    if (command === "restart") {
      write(conn, JSON.stringify(serverMessage("stylelint_d restarting.")));
      conn.end();

      server.close();
      server = startServer();
      return;
    }

    const formatter = args.formatter ? args.formatter : "string";
    const lintOpts: { [key: string]: any } = { formatter };

    let folder: string;
    let config: string = args.config || args.c;

    if (config) {
      console.info("Config flag passed");

      // If there is a config given, use that first
      if (!path.isAbsolute(config)) {
        console.info(`Relative config path given, making absolute to cwd (${cwd})`);
        config = path.resolve(cwd, config);
      }

      lintOpts.configFile = config;
      folder = path.dirname(config);
    } else {
      console.info("No config flag passed");
      // If no config is given, use the file parameter to determine where to set process directory to

      // If first file is not an absolute path, use the cwd of the `stylelint_d`
      // executable
      if (!path.isAbsolute(files[0])) {
        files = files.map((file) => path.resolve(cwd, file));
      }

      // Look at the first file, see if it's a glob, and return the possible
      // folder name
      const folderGlob = new glob.Glob(files[0]);
      folder = folderGlob.minimatch.set[0]
        .reduce(function (memo, i) {
          if (typeof i === "string") {
            memo.push(i);
          }

          return memo;
        }, [])
        .join("/");

      folder = path.dirname(folder);
    }

    // Import the linter dynamically based on the folder of the config or CSS file
    let linterPath;

    // If the module cannot be resolved at the given path, it will throw an error
    // In that case, use the package `stylelint` module
    try {
      linterPath = resolve.sync("stylelint", { basedir: folder });
      console.info(`Resolved stylelint in local folder ${folder}`);
    } catch (e) {
      linterPath = resolve.sync("stylelint");
      console.info("Could not resolve stylelint in CSS path, using package stylelint module");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires
    const linter: (opts: any) => Promise<LinterResult> = require(linterPath).lint;

    // "You must pass stylelint a `files` glob or a `code` string, though not both"
    if (args.stdin) {
      console.info("Given stdin");

      folder = files[0];
      lintOpts.code = args.stdin;

      if (args.file) {
        lintOpts.codeFilename = args.file;
      }

      if (args.language) {
        lintOpts.syntax = args.language;
      }
    } else {
      console.info(`Given files: ${files}`);

      lintOpts.files = files;
    }

    if (args.fix) {
      lintOpts.fix = args.fix;
    }

    linter(lintOpts)
      // eslint-disable-next-line
      .then(function (data) {
        console.info("Successfully linted. Sending data to client.");
        let result;

        if (formatter === "string") {
          // If the formatter is a string, we just send the raw output
          // from stylelint, since it's formatted for us already.
          result = JSON.stringify({
            output: data.output,
            errored: data.errored,
          });

          write(conn, result);
        } else {
          // To handle large data, we spread out sending the resulting
          // lint data over each of the deprecations, invalidOptionWarnings,
          // and warnings, sending them one at a time, separated by the
          // separator.
          let parsedOutput: LintResult[];

          try {
            parsedOutput = JSON.parse(data.output);
          } catch (e) {
            throw new Error("Stylelint data was invalid.");
          }

          for (const output of parsedOutput) {
            write(conn, "stylelint_d: start");
            write(conn, output.source);

            write(conn, "stylelint_d: deprecations");
            for (const deprecation of output.deprecations) {
              write(conn, JSON.stringify(deprecation));
            }

            write(conn, "stylelint_d: invalidOptionWarnings");
            for (const invalidOptionWarning of output.invalidOptionWarnings) {
              write(conn, JSON.stringify(invalidOptionWarning));
            }

            write(conn, "stylelint_d: warnings");
            for (const warning of output.warnings) {
              write(conn, JSON.stringify(warning));
            }

            write(conn, "stylelint_d: exitCode");
            if (output.warnings.length > 0) {
              write(conn, JSON.stringify(2));
            } else {
              write(conn, JSON.stringify(0));
            }
          }
        }
      })
      .catch(function (error) {
        console.info(`Could not lint: ${error}`);

        // If the error code is 78, it's due to a configuration error
        // If the error code is 80, it's a glob error
        // 78 -> 3, 80 -> 4, (other) -> 5

        let errorCode = 1;

        if (error.code === 78) {
          errorCode = 3;
        } else if (error.code === 80) {
          errorCode = 4;
        } else if (Number.isInteger(error.code)) {
          errorCode = 5;
        }

        const errorObject = {
          message: generateError(error, formatter),
          code: errorCode,
        };

        write(conn, "stylelint_d: isError");
        write(conn, JSON.stringify(errorObject));
      })
      .then(function () {
        // Finally, close the connection
        conn.end();
      });
  });
}
