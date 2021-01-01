import net from "net";
import resolve from "resolve";
import { lint as _lint } from "stylelint";
import { Server } from "./Server";
import { Socket } from "./Socket";
import { Command, Request } from "./types";

jest.mock("net");
jest.mock("./Socket");

jest.mock("stylelint", () => ({
  lint: jest.fn(),
}));

const SocketMock = Socket as jest.MockedClass<typeof Socket>;
const netServer = net.Server as jest.MockedClass<typeof net.Server>;
const netCreateServer = net.createServer as jest.MockedFunction<typeof net.createServer>;
const lint = _lint as jest.MockedFunction<typeof _lint>;

describe("Server", () => {
  let resolveSyncSpy: jest.SpyInstance;

  beforeEach(() => {
    resolveSyncSpy = jest.spyOn(resolve, "sync").mockReturnValue("stylelint");
  });

  afterEach(() => {
    resolveSyncSpy.mockRestore();
  });

  describe("#end", () => {
    it("should close the server", async () => {
      const { server } = await setup({ command: Command.__TEST__ });

      server.end();

      expect(netServer.prototype.close).toBeCalledTimes(1);
    });
  });

  describe("incoming connection", () => {
    describe("invalid data", () => {
      it("should send an error response if the socket rejects when getting data", async () => {
        await setup(new Error("bad data"));

        expect(SocketMock.prototype.send).toBeCalledWith({
          status: "error",
          command: "unknown",
          message: "Invalid client JSON",
        });
      });

      it("should fire a log event of the incoming command", async () => {
        const handleLog = jest.fn();

        await setup(new Error("bad data"), (server) => {
          server.on("log", handleLog);
        });

        expect(handleLog).toBeCalledTimes(1);
      });
    });

    describe("stop command", () => {
      it("should end the net.Server instance and send an appropriate message on the socket", async () => {
        const { socket } = await setup({
          command: Command.STOP,
        });

        expect(socket.send).toBeCalledWith({
          status: "ok",
          command: Command.STOP,
          message: "stylelint_d stopping...",
        });
      });

      it("should fire a stop event", async () => {
        const handleStop = jest.fn();

        await setup({ command: Command.STOP }, (server) => {
          server.on("stop", handleStop);
        });

        expect(handleStop).toBeCalledTimes(1);
      });
    });

    describe("restart command", () => {
      it("should end the current and create another net.Server instance", async () => {
        await setup({
          command: Command.RESTART,
        });

        expect(netServer.prototype.close).toBeCalledTimes(1);
        expect(netCreateServer).toBeCalledTimes(2);
      });

      it("should send an appropriate message on the socket", async () => {
        const { socket } = await setup({
          command: Command.RESTART,
        });

        expect(socket.send).toBeCalledWith({
          status: "ok",
          command: Command.RESTART,
          message: "stylelint_d restarting...",
        });
      });

      it("should fire a restart event", async () => {
        const handleRestart = jest.fn();

        await setup(
          {
            command: Command.RESTART,
          },
          (server) => {
            server.on("restart", handleRestart);
          }
        );

        expect(handleRestart).toBeCalledTimes(1);
      });
    });

    describe("lint command", () => {
      describe("stylelint module path resolution", () => {
        it("should use the configFile path as the basedir if provided", async () => {
          await setup({
            command: Command.LINT,
            lintArguments: {
              configFile: "/path/to/config/file.json",
              files: ["my-stylesheet.css"],
            },
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toBeCalledWith("stylelint", { basedir: "/path/to/config" });
        });

        it("should get the path from a given glob", async () => {
          await setup({
            command: Command.LINT,
            lintArguments: {
              files: ["./some/path/**/*"],
            },
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toBeCalledWith("stylelint", { basedir: "/the/cwd/some/path" });
        });

        it("should handle absolute path globs if given", async () => {
          await setup({
            command: Command.LINT,
            lintArguments: {
              files: ["/some/absolute/path/**/*"],
            },
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toBeCalledWith("stylelint", { basedir: "/some/absolute/path" });
        });

        it("should get the path from the first file, if it is not a glob and is absolute", async () => {
          await setup({
            command: Command.LINT,
            lintArguments: {
              files: ["/a/path/to/some/file.css"],
            },
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toBeCalledWith("stylelint", { basedir: "/a/path/to/some" });
        });

        it("should get the path from the first file resolved to the client cwd, if it is not absolute", async () => {
          await setup({
            command: Command.LINT,
            lintArguments: {
              files: ["./to/some/file.css"],
            },
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toBeCalledWith("stylelint", { basedir: "/the/cwd/to/some" });
        });

        it("should use the client cwd otherwise", async () => {
          await setup({
            command: Command.LINT,
            lintArguments: {},
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toBeCalledWith("stylelint", { basedir: "/the/cwd" });
        });

        it("should use the package provided stylelint module if the path does not resolve to a stylelint module", async () => {
          resolveSyncSpy.mockImplementationOnce(() => {
            throw new Error("could not resolve");
          });

          await setup({
            command: Command.LINT,
            lintArguments: {},
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toBeCalledTimes(2);
          expect(resolve.sync).toHaveBeenNthCalledWith(1, "stylelint", { basedir: "/the/cwd" });
          expect(resolve.sync).toHaveBeenNthCalledWith(2, "stylelint");
        });
      });

      it("should respond with the results of the linting when linting is successful", async () => {
        const lintResult = {
          something: "some result",
        } as any;

        lint.mockResolvedValueOnce(lintResult);

        const { socket } = await setup({
          command: Command.LINT,
          lintArguments: {},
          cwd: "/the/cwd",
        });

        expect(socket.send).toBeCalledWith({
          status: "ok",
          command: Command.LINT,
          result: lintResult,
        });
      });

      it("should send an error response if the linting throws", async () => {
        const error = new Error("bad linting");
        Object.assign(error, { code: 123 });

        lint.mockRejectedValueOnce(error);

        const { socket } = await setup({
          command: Command.LINT,
          lintArguments: {},
          cwd: "/the/cwd",
        });

        expect(socket.send).toBeCalledWith({
          status: "error",
          command: Command.LINT,
          message: error.message,
          metadata: {
            code: 123,
          },
        });
      });
    });
  });
});

async function setup(data: Request | Error, onServerInstantiation?: (server: Server) => void) {
  let connectionHandler: any;

  netCreateServer.mockImplementation((options: any, cb: any) => {
    connectionHandler = cb;

    return new net.Server(options, cb);
  });

  if (data instanceof Error) {
    SocketMock.prototype.getData.mockRejectedValueOnce(data);
  } else {
    SocketMock.prototype.getData.mockResolvedValueOnce(data);
  }

  const server = new Server();

  onServerInstantiation && onServerInstantiation(server);

  await connectionHandler();

  return {
    server,
    socket: SocketMock.prototype,
  };
}
