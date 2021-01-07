import minimist from "minimist";
import resolve from "resolve";
import * as path from "path";
import camelCase from "lodash.camelcase";
import { version as packageVersion } from "../package.json";
import { Socket } from "../src/Socket";
import { readStdin, spawnDaemon, daemonRunning } from "../src/utils";
import { Command, LintArguments, Response, Request, ClientResult } from "../src/types";

/**
 * Prints the help message.
 */
function generateHelpMessage() {
  return `Usage: stylelint_d command | lint options

stylelint_d is a thin wrapper on top of stylelint and supports all lint options that stylelint supports. For more information, please
see the stylelint documentation at https://stylelint.io/user-guide/usage/cli.

In addition, the following commands are supported:

> stylelint_d start

Start the stylelint_d daemon.

> stylelint_d stop

Stop the stylelint_d daemon.

> stylelint_d restart

Restart the stylelint_d daemon.

> stylelint_d status

Returns the status of the daemon, i.e. if it is running or not.

> stylelint_d version

Returns the current stylelint_d version. *Does not* return the possibly resolved stylelint module version.

> stylelint_d --help (-h)

Returns this help message.
`;
}

/**
 * Translate the given minimist arguments to camelcase.
 *
 * @param  flagArgs
 * @returns camelcased keys of given minimist flags
 */
function processFlagArgs(flagArgs: Omit<minimist.ParsedArgs, "_">): LintArguments {
  const args: { [key: string]: any } = {};

  for (const key in flagArgs) {
    args[camelCase(key)] = flagArgs[key];
  }

  return args as LintArguments;
}

/**
 * Runs the given arguments (from argv).
 *
 * @param  argv Arguments given from process.argv
 * @returns a lint or command result, or error
 */
export async function client(argv: string[]): Promise<ClientResult> {
  const parsedArgv: minimist.ParsedArgs = minimist(argv, {
    boolean: ["quiet", "stdin"],
    "--": false,
  });

  const { _: positionalArgs, ...flagArgs } = parsedArgv;
  let lintArguments: LintArguments = {};

  let command: Command = Command.LINT;

  if (flagArgs.version || flagArgs.v || positionalArgs[0] === "version") {
    command = Command.VERSION;
  } else if (positionalArgs[0] === "start") {
    command = Command.START;
  } else if (positionalArgs[0] === "stop") {
    command = Command.STOP;
  } else if (positionalArgs[0] === "restart") {
    command = Command.RESTART;
  } else if (positionalArgs[0] === "status") {
    command = Command.STATUS;
  } else if (flagArgs.help || flagArgs.h) {
    command = Command.HELP;
  }

  if (command === Command.LINT) {
    lintArguments = processFlagArgs(flagArgs);

    // A few commands need to be preprocessed before passing to the linter.
    // We need to do this since the official CLI does this too. It's not ideal
    // but it's tbe minimal amount of processing necessary before passing to
    // the linter.
    //
    // In particular, we need to:
    //
    // 1. Rename .stdin* to .code*
    // 2. If .quiet, add it to configOverrides
    // 3. Transform to absolute path:
    //    - .config (and rename to .configFile)
    //    - .configBasedir
    //    - .customFormatter
    if (lintArguments.stdin || positionalArgs.length === 0) {
      const stdinValue = await readStdin();

      lintArguments.code = stdinValue;
      delete lintArguments.stdin;
    }

    if (lintArguments.stdinFilename) {
      if (lintArguments.code) {
        lintArguments.codeFilename = lintArguments.stdinFilename;
      }

      delete lintArguments.stdinFilename;
    }

    // Ensure that stdin is removed if it is still present
    lintArguments.stdin != undefined && delete lintArguments.stdin;

    // Set the files array if no stdin was provided
    if (!lintArguments.code) {
      lintArguments.files = positionalArgs;
    }

    if (lintArguments.quiet) {
      lintArguments.configOverrides = Object.assign({}, lintArguments.configOverrides, {
        quiet: true,
      });
      delete lintArguments.quiet;
    }

    // Ensure that quiet is removed if it is still present
    lintArguments.quiet != undefined && delete lintArguments.quiet;

    if (lintArguments.config) {
      try {
        lintArguments.configFile = resolve.sync(lintArguments.config, { basedir: process.cwd() });
      } catch {
        if (path.isAbsolute(lintArguments.config)) {
          lintArguments.configFile = lintArguments.config;
        } else {
          lintArguments.configFile = path.resolve(process.cwd(), lintArguments.config);
        }
      }

      delete lintArguments.config;
    }

    if (lintArguments.configBasedir) {
      if (!path.isAbsolute(lintArguments.configBasedir)) {
        lintArguments.configBasedir = path.resolve(process.cwd(), lintArguments.configBasedir);
      }
    }

    if (lintArguments.customFormatter) {
      if (!path.isAbsolute(lintArguments.customFormatter)) {
        try {
          lintArguments.customFormatter = resolve.sync(lintArguments.customFormatter, {
            basedir: process.cwd(),
          });
        } catch {
          lintArguments.customFormatter = path.resolve(
            process.cwd(),
            lintArguments.customFormatter
          );
        }
      }
    }

    if (!lintArguments.formatter) {
      lintArguments.formatter = "string";
    }
  }

  return handleCommand(command, lintArguments);
}

async function handleCommand(
  command: Command,
  lintArguments: LintArguments
): Promise<ClientResult> {
  if (command === Command.HELP) {
    return {
      message: generateHelpMessage(),
    };
  }

  if (command === Command.STATUS) {
    const serverRunning = await daemonRunning();

    return {
      message: `stylelint_d is${serverRunning ? " " : " not "}running.`,
    };
  }

  if (command === Command.START) {
    const serverRunning = await daemonRunning();

    if (serverRunning) {
      return {
        message: "stylelint_d is already running.",
        code: 1,
      };
    }

    await spawnDaemon();

    return {
      message: "stylelint_d started.",
    };
  }

  if (command === Command.STOP) {
    const serverRunning = await daemonRunning();

    if (!serverRunning) {
      return {
        message: "stylelint_d is not running.",
        code: 1,
      };
    }
  }

  if (command === Command.VERSION) {
    return {
      message: packageVersion,
    };
  }

  if (command === Command.RESTART) {
    if (!(await daemonRunning())) {
      return {
        message: "stylelint_d is not running.",
        code: 1,
      };
    }
  }

  // Lint, stop, and restart are handled by the server
  try {
    await spawnDaemon();
  } catch {
    // Server is already spawned, ignore the error
  }

  const socket = await Socket.createClientSocket();
  await socket.send<Request>({ cwd: process.cwd(), command, lintArguments });

  const response = await socket.getData<Response>();

  if (response.status === "error") {
    return {
      message: `Error: ${response.message}`,
      code: response.metadata?.code ?? 1,
    };
  }

  if (response.command === Command.LINT) {
    return {
      message: response.output,
      code: response.errored ? 2 : 0,
    };
  }

  if (response.command === Command.STOP) {
    const baseMessage = response.message;

    if (await daemonRunning()) {
      return {
        message: `${baseMessage} error, stylelint_d daemon not stopped successfully.`,
        code: 1,
      };
    }

    return {
      message: `${baseMessage} ok.`,
    };
  }

  if (response.command === Command.RESTART) {
    const baseMessage = response.message;

    if (!(await daemonRunning())) {
      return {
        message: `${baseMessage} error, stylelint_d daemon not restarted successfully.`,
        code: 1,
      };
    }

    return {
      message: `${baseMessage} ok.`,
    };
  }

  // If we've reached here, we've somehow gotten an invalid response. Just tell the user
  // something went wrong
  return {
    message: "Error: unexpected invalid response from server",
    code: 1,
  };
}
