import net from "net";
import path from "path";
import resolve from "resolve";
import { globIterate } from "glob";
import { LinterResult } from "stylelint";
import { Socket } from "./Socket";
import { LintRequest, Request, Command, Response, LintArguments } from "./types";

type EventCallback = (data: any) => void;
type Event = "log" | "restart" | "stop";

export const PORT = 48126;

/**
 * The linting server. Becomes daemonized via `daemon/process`.
 */
export class Server {
  private server: net.Server;
  private listeners: { [key: string]: EventCallback } = {};

  /**
   * Create a new net.Server instance listening on 127.0.0.1:48126.
   * @param handleConnection the connection handling function
   * @returns a new net.Server instance
   */
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

  /**
   * Closes the current net.Server instance.
   *
   * @param isStopping if the server is stopping (meaning, the user sent the stop command)
   */
  end(isStopping = false): void {
    this.server.close();

    if (isStopping) {
      this.fireEvent("stop");
    }
  }

  /**
   * Adds an event listener for the given event.
   *
   * @param eventName name of the event
   * @param cb Callback to call when the event is fired.
   * @remarks TODO: polymorphic type for this function
   */
  on(eventName: Event, cb: EventCallback): void {
    this.listeners[eventName] = cb;
  }

  /**
   * Fire an event, if it has a listener.
   *
   * @param eventName
   * @param data
   */
  private fireEvent(eventName: Event, data?: any) {
    this.listeners[eventName] && this.listeners[eventName](data);
  }

  /**
   * Handle an incoming net.Socket connection.
   *
   * Passes a Socket instance wrapped net.Socket instance to this.processSocket.
   *
   * If it throws, logs the error. If the socket is still writable, send an
   * error over the socket as well.
   *
   * @param rawSocket the incoming net.Socket
   */
  private async handleConnection(rawSocket: net.Socket) {
    const socket = new Socket(rawSocket, "server");

    try {
      await this.processSocket(socket);
    } catch (error) {
      this.fireEvent("log", {
        error,
      });

      const response: Response = {
        status: "error",
        command: "unknown",
        message: "An unexpected server error occurred",
      };

      if (error instanceof Error) {
        response.message = `A server error occurred: ${error.message}`;
      }

      if (socket.writable) {
        socket.send<Response>(response);
      }
    }
  }

  /**
   * Restarts the server.
   */
  private restart() {
    this.end();
    this.server = Server.createInstance(this.handleConnection.bind(this));

    this.fireEvent("restart");
  }

  /**
   * Processes an incoming connection.
   *
   * @param  socket Socket instance of the net.Socket connection
   */
  private async processSocket(socket: Socket): Promise<void> {
    let data;

    try {
      data = await socket.getData<Request>();
    } catch (error) {
      await socket.send<Response>({
        status: "error",
        command: "unknown",
        message: "Invalid client JSON",
      });

      this.fireEvent("log", {
        error,
      });

      return;
    }

    if (!data) {
      return;
    }

    const { command } = data;

    this.fireEvent("log", {
      message: `Command received: ${command}`,
    });

    // This is not ideal because we're creating a custom command just to test this case. Further thought into how to make this
    // testable _without_ needing Command.__TEST_FAIL__ will happen later.
    if (command === Command.__TEST_FAIL__) {
      throw new Error("An expected test failure occurred");
    }

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
      // Take the first given file.
      //
      // If it's a glob, treat it as a glob. If it resolves to any file, take the first file's
      // (absolute) path, and consider that the baseDir for stylelint. If it doesn't resolve to any
      // file then use `clientCwd`.
      //
      // If it's a file, use it and make it absolute to cwd if it isn't absolute.
      const fileOrGlob: string = lintArguments.files[0];

      if (fileOrGlob.match(/\*/)) {
        const folderGlob = globIterate(fileOrGlob, { ignore: "node_modules/**", absolute: true });

        // If we don't find a file (i.e. value is undefined), the glob didn't match anything. Although we could bail
        // out early here, let's let `stylelint` handle it instead in case it has some defaults that we don't.
        const foundFile = (await folderGlob.next()).value;

        if (foundFile) {
          lintResolveBasedir = path.dirname(foundFile);
        } else {
          lintResolveBasedir = clientCwd;
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
    } catch (error) {
      // We don't know the error type and the possible types aren't exported in any way from Stylelint, so
      // we can just cast to any and get message and code from it
      const { message, code } = error as any;

      await socket.send<Response>({
        status: "error",
        command,
        message,
        metadata: {
          code: typeof code === "number" ? code : 1,
        },
      });

      return;
    }

    await socket.send<Response>({
      status: "ok",
      command: Command.LINT,
      output: result.output,
      errored: result.errored,
    });
  }
}
