#!/usr/bin/env node

/*
  Exit codes:

  1: Something else went wrong.
  2: At least one rule with an "error"-level severity triggered at least one violations.
 */

import minimist from "minimist";
import net from "net";
import { spawn } from "child_process";

import packageJson from "../package.json";

import { separator, generateError, validCommand } from "../src/utils";

main(minimist(process.argv.slice(2)));

type Arguments = {
  files: string[];
  command?: string;
  stdin?: string;
  config?: string;
  language?: string;
  formatter: string;
};

type StylelintDDatumType =
  | "other"
  | "start"
  | "deprecations"
  | "invalidOptionWarnings"
  | "warnings"
  | "exitCode";
type StylelintDOutput = {
  source: string;
  deprecations: any[];
  invalidOptionWarnings: any[];
  warnings: any[];
};

function separateData(pieces: string[]) {
  return pieces
    .join("")
    .split(separator)
    .filter((i) => !!i.trim());
}

function main(argv: minimist.ParsedArgs) {
  // If version, show current package.json version
  if (argv.version || argv.v) {
    console.log(packageJson.version);
    return;
  }

  const stdin = "";
  const filename = argv.file || argv.f;
  const config = argv.config || argv.c;
  const language = argv.language;
  const formatter = argv.formatter ?? "string";

  if (argv.stdin) {
    if (!filename && !config) {
      console.log("Error: --stdin requires --config or --file flags");
      return;
    }

    const validSyntaxes = ["scss", "less", "sugarss", "sss"];
    const recommendedSyntaxes = "scss, less, sugarss";

    if (language && validSyntaxes.indexOf(language) === -1) {
      console.log(
        `Error: invalid language (${language}). Valid languages: ${recommendedSyntaxes}`
      );
      return;
    }

    process.stdin.on("end", function () {
      argv.stdin = stdin;
      argv.files = [filename];

      const args = {
        files: [filename],
        formatter,
        stdin,
        config,
        language,
      };

      lint(args);
    });
  } else {
    const args = {
      files: filename ? [filename] : argv._,
      command: argv._[0],
      formatter,
      stdin,
      config,
      language,
    };

    lint(args);
  }
}

function lint(args: Arguments) {
  const command = args.command;
  const format = args.formatter;

  // Start or return server connection
  getServerConn()
    .then(function (conn: net.Socket) {
      // If it's a start command, we handle it here
      if (command === "start") {
        // The server has already started by virtue of getServerConn
        console.log("stylelint_d started.");
        conn.end();
        return;
      }

      let data: string[] = [];

      // We write both the cwd and the potential filename, in
      // case we are given a relative path
      conn.write(JSON.stringify([process.cwd(), args]) + separator);
      conn.on("data", function (d) {
        data.push(d.toString("utf8"));
      });

      conn.on("end", function () {
        data = separateData(data);

        // If we were given a command, first try to parse the
        // resulting data in case it is a server message, and
        // if it is, print that.
        let message;

        if (validCommand(command)) {
          try {
            message = JSON.parse(data.join(""));

            if (message.message) {
              console.log(message.message);
            }
          } catch (e) {
            process.exitCode = 1;

            console.log("Could not parse JSON after ended:");
            console.log(e);
          }

          return;
        }

        // Determine if it's an error, first
        let errorObject;
        let parsed;
        if (data[0] === "stylelint_d: isError") {
          errorObject = data[1];

          try {
            parsed = JSON.parse(errorObject);
          } catch (e) {
            throw new Error("Unknown error occurred.");
          }

          process.exitCode = parsed.code;

          console.log(parsed.message);

          return;
        }

        if (format === "string") {
          const result = data.join("");

          try {
            parsed = JSON.parse(result);
          } catch (e) {
            process.exitCode = 1;

            console.log("Error: Could not parse `stylelint_d` result");
            console.error(e);

            return;
          }

          const didErrored = parsed.errored;
          const output = parsed.output;

          if (didErrored) {
            process.exitCode = 2;
          }

          console.log(output);
        } else {
          let currentType: StylelintDDatumType = "other";

          const output: StylelintDOutput = {
            // Source filename
            source: "",
            deprecations: [],
            invalidOptionWarnings: [],
            warnings: [],
          };

          for (const datum of data) {
            if (datum.startsWith("stylelint_d: ")) {
              currentType = datum.split(
                "stylelint_d: "
              )[0] as StylelintDDatumType;
              continue;
            }

            if (currentType === "other") {
              continue;
            } else if (currentType === "start") {
              output.source = datum;
              continue;
            } else if (currentType === "exitCode") {
              process.exitCode = parseInt(datum, 10);
              continue;
            } else {
              let parsedDatum;

              try {
                parsedDatum = JSON.parse(datum);
              } catch {
                throw new Error(`Could not parse Stylelint JSON: ${datum}`);
              }

              output[currentType].push(parsedDatum);
            }
          }

          console.log(JSON.stringify([output]));
        }
      });
    })
    .catch(function (err) {
      process.exitCode = 1;

      console.log(generateError(err));
    });
}

function getServerConn(): Promise<net.Socket> {
  const promise = new Promise<net.Socket>((resolve, reject) => {
    // Make sure the socket can be connected to
    const socket = new net.Socket({});

    socket.once("error", function () {
      const server = require.resolve("../lib/server");
      const child = spawn("node", [server], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });
      child.unref();

      // Close this connection
      socket.destroy();

      // Wait for server to spawn and socket to connect
      waitForSocket()
        .then(function (actualSocket) {
          resolve(actualSocket);
        })
        .catch(reject);
    });

    socket.once("connect", function () {
      resolve(socket);
    });

    socket.connect({ port: 48126, host: "127.0.0.1" });
  });

  return promise;
}

function waitForSocket(): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve) => {
    function wait() {
      const socket = new net.Socket({});

      socket.once("error", wait);
      socket.once("connect", () => resolve(socket));

      socket.connect({ port: 48126, host: "127.0.0.1" });
    }

    wait();
  });
}
