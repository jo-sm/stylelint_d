import net from "net";
import resolve from "resolve";
import { globSync } from "glob";
import stylelint from "stylelint";
import { Server } from "./Server";
import { Socket } from "./Socket";
import { Command, Request } from "./types";
import * as path from "path";

jest.mock("net");
jest.mock("./Socket");

const SocketMock = Socket as jest.MockedClass<typeof Socket>;
const netServer = net.Server as jest.MockedClass<typeof net.Server>;
const netCreateServer = net.createServer as jest.MockedFunction<typeof net.createServer>;

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

      expect(netServer.prototype.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("incoming connection", () => {
    describe("invalid data", () => {
      it("should send an error response if the socket rejects when getting data", async () => {
        await setup(new Error("bad data"));

        expect(SocketMock.prototype.send).toHaveBeenCalledWith({
          status: "error",
          command: "unknown",
          message: "Invalid client JSON",
        });
      });

      it("should fire a log event of the incoming command", async () => {
        const handleLog = jest.fn();
        const error = new Error("bad data");

        await setup(error, (server) => {
          server.on("log", handleLog);
        });

        expect(handleLog).toHaveBeenCalledTimes(1);
        expect(handleLog).toHaveBeenCalledWith({ error });
      });
    });

    describe("thrown error after parsing", () => {
      it("should send an error response if there was some error after getting data", async () => {
        // @ts-expect-error: FIXME the test should stop mocking Socket. Treat Server as an integration test
        SocketMock.prototype.writable = true;

        await setup({
          command: Command.__TEST_FAIL__,
        });

        expect(SocketMock.prototype.send).toHaveBeenCalledWith({
          status: "error",
          command: "unknown",
          message: "A server error occurred: An expected test failure occurred",
        });
      });

      it("should log the error", async () => {
        const handleLog = jest.fn();

        await setup({ command: Command.__TEST_FAIL__ }, (server) => {
          server.on("log", handleLog);
        });

        expect(handleLog).toHaveBeenCalledTimes(2);
        expect(handleLog).toHaveBeenNthCalledWith(1, {
          message: `Command received: ${Command.__TEST_FAIL__}`,
        });
        expect(handleLog).toHaveBeenNthCalledWith(2, {
          error: expect.objectContaining({
            message: "An expected test failure occurred",
          }),
        });
      });
    });

    describe("stop command", () => {
      it("should end the net.Server instance and send an appropriate message on the socket", async () => {
        const { socket } = await setup({
          command: Command.STOP,
        });

        expect(socket.send).toHaveBeenCalledWith({
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

        expect(handleStop).toHaveBeenCalledTimes(1);
      });
    });

    describe("restart command", () => {
      it("should end the current and create another net.Server instance", async () => {
        await setup({
          command: Command.RESTART,
        });

        expect(netServer.prototype.close).toHaveBeenCalledTimes(1);
        expect(netCreateServer).toHaveBeenCalledTimes(2);
      });

      it("should send an appropriate message on the socket", async () => {
        const { socket } = await setup({
          command: Command.RESTART,
        });

        expect(socket.send).toHaveBeenCalledWith({
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

        expect(handleRestart).toHaveBeenCalledTimes(1);
      });
    });

    describe("lint command", () => {
      let lintSpy: jest.SpyInstance;

      beforeEach(() => {
        lintSpy = jest.spyOn(stylelint, "lint").mockResolvedValue({
          errored: false,
          output: "",
          results: [],
          reportedDisables: [],
          cwd: "/fake/cwd",
        });
      });

      afterEach(() => {
        lintSpy.mockRestore();
      });

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

          expect(resolve.sync).toHaveBeenCalledWith("stylelint", { basedir: "/path/to/config" });
        });

        it("should treat the first file as a glob and get its path, if it resolves to a file", async () => {
          const files = ["**/*.css"];
          const expectedBaseDir = path.dirname(globSync(files[0], { absolute: true })[0]);

          await setup({
            command: Command.LINT,
            lintArguments: {
              files,
            },
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toHaveBeenCalledWith("stylelint", {
            basedir: expectedBaseDir,
          });
        });

        it("should default to the provided `cwd` if the first file in the glob doesn't match anything", async () => {
          await setup({
            command: Command.LINT,
            lintArguments: {
              files: ["something/fake/**/*.css"],
            },
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toHaveBeenCalledWith("stylelint", {
            basedir: "/the/cwd",
          });
        });

        it("should get the path from the first file, if it is not a glob and is absolute", async () => {
          await setup({
            command: Command.LINT,
            lintArguments: {
              files: ["/a/path/to/some/file.css"],
            },
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toHaveBeenCalledWith("stylelint", { basedir: "/a/path/to/some" });
        });

        it("should get the path from the first file resolved to the client cwd, if it is not absolute", async () => {
          await setup({
            command: Command.LINT,
            lintArguments: {
              files: ["./to/some/file.css"],
            },
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toHaveBeenCalledWith("stylelint", { basedir: "/the/cwd/to/some" });
        });

        it("should use the client cwd otherwise", async () => {
          await setup({
            command: Command.LINT,
            lintArguments: {},
            cwd: "/the/cwd",
          });

          expect(resolve.sync).toHaveBeenCalledWith("stylelint", { basedir: "/the/cwd" });
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

          expect(resolve.sync).toHaveBeenCalledTimes(2);
          expect(resolve.sync).toHaveBeenNthCalledWith(1, "stylelint", { basedir: "/the/cwd" });
          expect(resolve.sync).toHaveBeenNthCalledWith(2, "stylelint");
        });
      });

      it("should respond with the results of the linting when linting is successful", async () => {
        const lintResult = {
          output: "some result",
          errored: true,
          result: {
            key: "some value",
          },
        } as any;

        lintSpy.mockResolvedValueOnce(lintResult);

        const { socket } = await setup({
          command: Command.LINT,
          lintArguments: {},
          cwd: "/the/cwd",
        });

        expect(socket.send).toHaveBeenCalledWith({
          status: "ok",
          command: Command.LINT,
          output: lintResult.output,
          errored: lintResult.errored,
        });
      });

      it("should send an error response if the linting throws", async () => {
        const error = new Error("bad linting");
        Object.assign(error, { code: 123 });

        lintSpy.mockRejectedValueOnce(error);

        const { socket } = await setup({
          command: Command.LINT,
          lintArguments: {},
          cwd: "/the/cwd",
        });

        expect(socket.send).toHaveBeenCalledWith({
          status: "error",
          command: Command.LINT,
          message: error.message,
          metadata: {
            code: 123,
          },
        });
      });
    });

    describe("stylelint.lint integration", () => {
      it("should properly lint a file with no errors", async () => {
        const filename = path.resolve(__dirname, "fixtures", "ok.css");

        const expectedOutput = [
          {
            source: filename,
            deprecations: [],
            invalidOptionWarnings: [],
            parseErrors: [],
            errored: false,
            warnings: [],
          },
        ];

        const { socket } = await setup({
          command: Command.LINT,
          lintArguments: {
            files: [filename],
            configFile: path.resolve(__dirname, "fixtures", "stylelint.config.json"),
          },
          cwd: __dirname,
        });

        // In my opinion, a snapshot assertion would be nice here as it would remove the need to have an object
        // above that has specific key orders (it has to match the JSON.stringify result). However it's not possible
        // on either `socket.send.mock.calls[0]` or `mock.calls[0][0].output` as both would contain an absolute
        // path and wouldn't work across different machines.
        expect(socket.send).toHaveBeenCalledWith({
          status: "ok",
          command: Command.LINT,
          output: JSON.stringify(expectedOutput),
          errored: false,
        });
      });

      it("should properly lint a file with errors", async () => {
        const filename = path.resolve(__dirname, "fixtures", "not-ok.css");
        const expectedOutput = [
          {
            source: filename,
            deprecations: [],
            invalidOptionWarnings: [],
            parseErrors: [],
            errored: true,
            warnings: [
              {
                line: 2,
                column: 10,
                endLine: 2,
                endColumn: 13,
                rule: "color-no-invalid-hex",
                severity: "error",
                text: `Unexpected invalid hex color "#ff" (color-no-invalid-hex)`,
              },
            ],
          },
        ];

        const { socket } = await setup({
          command: Command.LINT,
          lintArguments: {
            files: [filename],
            configFile: path.resolve(__dirname, "fixtures", "stylelint.config.json"),
          },
          cwd: __dirname,
        });

        expect(socket.send).toHaveBeenCalledWith({
          status: "ok",
          command: Command.LINT,
          output: JSON.stringify(expectedOutput),
          errored: true,
        });
      });

      it("should handle an invalid css file", async () => {
        const filename = path.resolve(__dirname, "fixtures", "invalid.css");
        const expectedOutput = [
          {
            source: filename,
            deprecations: [],
            invalidOptionWarnings: [],
            parseErrors: [],
            errored: true,
            warnings: [
              {
                line: 1,
                column: 1,
                rule: "CssSyntaxError",
                severity: "error",
                text: `Unclosed block (CssSyntaxError)`,
              },
            ],
          },
        ];

        const { socket } = await setup({
          command: Command.LINT,
          lintArguments: {
            files: [filename],
            configFile: path.resolve(__dirname, "fixtures", "stylelint.config.json"),
          },
          cwd: __dirname,
        });

        expect(socket.send).toHaveBeenCalledWith({
          status: "ok",
          command: Command.LINT,
          output: JSON.stringify(expectedOutput),
          errored: true,
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
