import net from "net";
import path from "path";
import resolve from "resolve";
import glob from "glob";
import { LinterResult } from "stylelint";
import { Socket } from "./Socket";
import { LintRequest, Request, Command, Response, LintArguments } from "./types";

type EventCallback = (data: any) => void;
type Event = "log" | "restart" | "stop";

export const PORT = 48126;

export class Server {
  private server: net.Server;
  private listeners: { [key: string]: EventCallback } = {};

  private static createInstance(
    handleConnection: typeof Server.prototype.handleConnection
  ): net.Server {
    const instance = net.createServer({ allowHalfOpen: true }, handleConnection);

    instance.listen(PORT, "127.0.0.1");

    return instance;
  }

  constructor() {
    this.server = Server.createInstance(this.handleConnection.bind(this));
  }

  end(isStopping = false): void {
    this.server.close();

    if (isStopping) {
      this.fireEvent("stop");
    }
  }

  // TODO: polymorphic type for this
  on(eventName: Event, cb: EventCallback): void {
    this.listeners[eventName] = cb;
  }

  private fireEvent(eventName: Event, data?: any) {
    this.listeners[eventName] && this.listeners[eventName](data);
  }

  private async handleConnection(rawSocket: net.Socket) {
    const socket = new Socket(rawSocket, "server");

    try {
      await this.onConnection(socket);
    } catch (error) {
      if (socket.writable) {
        socket.send<Response>({
          status: "error",
          command: "unknown",
          message: `A server error occurred: ${error.message}`,
        });
      }

      this.fireEvent("log", {
        message: error.message,
      });
    }
  }

  private restart() {
    this.end();
    this.server = Server.createInstance(this.handleConnection.bind(this));

    this.fireEvent("restart");
  }

  private async onConnection(socket: Socket): Promise<void> {
    let data;

    try {
      data = await socket.getData<Request>();
    } catch (err) {
      await socket.send<Response>({
        status: "error",
        command: "unknown",
        message: "Invalid client JSON",
      });

      this.fireEvent("log", {
        message: err.message,
      });

      return;
    }

    const { command } = data;

    this.fireEvent("log", {
      message: `Command received: ${command}`,
    });

    if (command === Command.STOP) {
      await socket.send<Response>({
        status: "ok",
        command,
        message: "stylelint_d stopping...",
      });

      this.end(true);

      return;
    }

    if (command === Command.RESTART) {
      await socket.send<Response>({
        status: "ok",
        command,
        message: "stylelint_d restarting...",
      });

      this.restart();

      return;
    }

    const { lintArguments, cwd: clientCwd } = data as LintRequest;

    let lintResolveBasedir: string;

    if (lintArguments.configFile) {
      lintResolveBasedir = path.dirname(lintArguments.configFile);
    } else if (lintArguments.files) {
      // Take the first given file. If it's a glob, get the path of the glob. Otherwise,
      // make it absolute to cwd if it isn't absolute.
      const fileOrGlob: string = lintArguments.files[0];

      if (fileOrGlob.match(/\*/)) {
        const folderGlob = new glob.Glob(fileOrGlob);

        lintResolveBasedir = folderGlob.minimatch.set[0]
          .reduce<string[]>((memo, i) => {
            if (typeof i === "string") {
              memo.push(i);
            }

            return memo;
          }, [])
          .join("/");

        if (!path.isAbsolute(lintResolveBasedir)) {
          lintResolveBasedir = path.resolve(clientCwd, lintResolveBasedir);
        }
      } else if (path.isAbsolute(fileOrGlob)) {
        lintResolveBasedir = path.dirname(fileOrGlob);
      } else {
        const absoluteFilename = path.resolve(clientCwd, fileOrGlob);

        lintResolveBasedir = path.dirname(absoluteFilename);
      }
    } else {
      lintResolveBasedir = clientCwd;
    }

    // Import the linter dynamically based on the folder of the config or CSS file
    let linterPath;

    // If the module cannot be resolved at the given path, it will throw an error
    // In that case, use the package `stylelint` module
    try {
      linterPath = resolve.sync("stylelint", { basedir: lintResolveBasedir });

      this.fireEvent("log", {
        message: `Resolved stylelint in folder ${lintResolveBasedir}`,
      });
    } catch (e) {
      linterPath = resolve.sync("stylelint");

      this.fireEvent("log", {
        message: `Could not resolve stylelint in ${lintResolveBasedir}, using package stylelint module`,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const linter: (opts: LintArguments) => Promise<LinterResult> = require(linterPath).lint;

    let result;

    try {
      result = await linter(lintArguments);
    } catch (err) {
      await socket.send<Response>({
        status: "error",
        command,
        message: err.message,
        metadata: {
          code: err.code,
        },
      });

      return;
    }

    await socket.send<Response>({
      status: "ok",
      command: Command.LINT,
      result,
    });
  }
}
