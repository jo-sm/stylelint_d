import { mocked } from "ts-jest/utils";

import { Command } from "./types";
import { version as packageVersion } from "../package.json";
import * as _utils from "./utils";
import { Socket } from "./Socket";
import { client } from "./client";
import resolve from "resolve";

jest.mock("./Socket");
jest.mock("./utils", () => ({
  readStdin: jest.fn(),
  spawnDaemon: jest.fn(),
  daemonRunning: jest.fn(),
}));

const utils = mocked(_utils);
const MockedSocket = Socket as jest.MockedClass<typeof Socket>;

describe("client", () => {
  let resolveSyncSpy: jest.SpyInstance;

  beforeEach(() => {
    resolveSyncSpy = jest.spyOn(resolve, "sync");
  });

  afterEach(() => {
    resolveSyncSpy.mockRestore();
  });

  describe("help command", () => {
    it("returns a help message string", async () => {
      for (const argv of [["--help"], ["-h"], ["-v"]]) {
        expect(await client(argv)).toStrictEqual({
          message: expect.any(String),
        });
      }
    });
  });

  describe("start command", () => {
    it("should return a response with a code if the daemon is running", async () => {
      utils.daemonRunning.mockResolvedValueOnce(true);

      expect(await client(["start"])).toStrictEqual({
        message: "stylelint_d is already running.",
        code: 1,
      });
    });

    it("should spawn the daemon process and return a message", async () => {
      expect(await client(["start"])).toStrictEqual({
        message: "stylelint_d started.",
      });

      expect(utils.spawnDaemon).toBeCalled();
    });
  });

  describe("stop command", () => {
    it("should return a response with a code if the daemon is not running", async () => {
      utils.daemonRunning.mockResolvedValueOnce(false);

      expect(await client(["stop"])).toStrictEqual({
        message: "stylelint_d is not running.",
        code: 1,
      });
    });

    it("should send a stop command to the server and return a message", async () => {
      utils.daemonRunning.mockResolvedValueOnce(true);

      const { socket } = setup();
      socket.getData.mockResolvedValue({
        command: Command.STOP,
        message: "stylelint_d stopping...",
      });

      expect(await client(["stop"])).toStrictEqual({
        message: "stylelint_d stopping... ok.",
      });

      expect(socket.send).toBeCalledWith({
        command: Command.STOP,
        cwd: expect.any(String),
        lintArguments: {},
      });
    });

    it("should return a response with a code if the daemon is running after the server responds", async () => {
      utils.daemonRunning.mockResolvedValueOnce(true);
      utils.daemonRunning.mockResolvedValueOnce(true);

      const { socket } = setup();
      socket.getData.mockResolvedValue({
        command: Command.STOP,
        message: "stylelint_d stopping...",
      });

      expect(await client(["stop"])).toStrictEqual({
        message: "stylelint_d stopping... error, stylelint_d daemon not stopped successfully.",
        code: 1,
      });
    });
  });

  describe("restart command", () => {
    it("should return a response with a code if the daemon is not running", async () => {
      utils.daemonRunning.mockResolvedValueOnce(false);

      expect(await client(["restart"])).toStrictEqual({
        message: "stylelint_d is not running.",
        code: 1,
      });
    });

    it("should send a restart command to the server and return a message", async () => {
      utils.daemonRunning.mockResolvedValueOnce(true);
      utils.daemonRunning.mockResolvedValueOnce(true);

      const { socket } = setup();
      socket.getData.mockResolvedValue({
        command: Command.RESTART,
        message: "stylelint_d restarting...",
      });

      expect(await client(["restart"])).toStrictEqual({
        message: "stylelint_d restarting... ok.",
      });

      expect(socket.send).toBeCalledWith({
        command: Command.RESTART,
        cwd: expect.any(String),
        lintArguments: {},
      });
    });

    it("should return a response with a code if the daemon is not running after the server responds", async () => {
      utils.daemonRunning.mockResolvedValueOnce(true);
      utils.daemonRunning.mockResolvedValueOnce(false);

      const { socket } = setup();
      socket.getData.mockResolvedValue({
        command: Command.RESTART,
        message: "stylelint_d restarting...",
      });

      expect(await client(["restart"])).toStrictEqual({
        message: "stylelint_d restarting... error, stylelint_d daemon not restarted successfully.",
        code: 1,
      });
    });
  });

  describe("version command", () => {
    it("should return a message with the version", async () => {
      for (const argv of [["version"], ["--version"], ["-v"]]) {
        expect(await client(argv)).toStrictEqual({
          message: packageVersion,
        });
      }
    });
  });

  describe("status command", () => {
    it("should return the right message depending on if the daemon is running", async () => {
      utils.daemonRunning.mockResolvedValueOnce(false);

      expect(await client(["status"])).toStrictEqual({
        message: "stylelint_d is not running.",
      });

      utils.daemonRunning.mockResolvedValueOnce(true);

      expect(await client(["status"])).toStrictEqual({
        message: "stylelint_d is running.",
      });
    });
  });

  describe("lint command", () => {
    it('should add a formatter if given, or "string" otherwise', async () => {
      const { socket } = setup();

      await client(["file.css"]);

      expect(socket.send).toHaveBeenNthCalledWith(1, {
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          files: ["file.css"],
          formatter: "string",
        },
      });

      await client(["--formatter", "something-else", "file.css"]);

      expect(socket.send).toHaveBeenNthCalledWith(2, {
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          files: ["file.css"],
          formatter: "something-else",
        },
      });
    });

    it("should send a lint command to the server", async () => {
      const { socket } = setup();

      await client(["some/file.css", "some/otherfile.css"]);

      expect(socket.send).toBeCalledWith({
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          files: ["some/file.css", "some/otherfile.css"],
          formatter: "string",
        },
      });
    });

    it("should add the quiet option to the configOverrides", async () => {
      const { socket } = setup();

      await client(["--quiet", "some/file.css"]);

      expect(socket.send).toBeCalledWith({
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          configOverrides: {
            quiet: true,
          },
          files: ["some/file.css"],
          formatter: "string",
        },
      });
    });

    it("should read from stdin if no files are given, even if another flag is passed", async () => {
      await client(["--quiet"]);

      expect(utils.readStdin).toBeCalledTimes(1);
    });

    it("should read from stdin if the stdin flag is passed", async () => {
      await client(["--stdin"]);

      expect(utils.readStdin).toBeCalledTimes(1);
    });

    it("should set the provided stdin text as the code argument", async () => {
      utils.readStdin.mockResolvedValueOnce("some stdin code");

      const { socket } = setup();

      await client(["--stdin", "--stdinFilename", "/path/to/some/filename.css"]);

      expect(socket.send).toBeCalledWith({
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          code: "some stdin code",
          codeFilename: "/path/to/some/filename.css",
          formatter: "string",
        },
      });
    });

    it("should ignore the codeFilename flag is no stdin was needed", async () => {
      const { socket } = setup();

      await client(["/some/css/file.css", "--stdinFilename", "/path/to/some/filename.css"]);

      expect(socket.send).toBeCalledWith({
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          files: ["/some/css/file.css"],
          formatter: "string",
        },
      });
    });

    it("should set the config file argument if the config flag is passed", async () => {
      const { socket } = setup();

      await client(["file.css", "--config", "/config/file.json"]);

      expect(socket.send).toBeCalledWith({
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          files: ["file.css"],
          configFile: "/config/file.json",
          formatter: "string",
        },
      });
    });

    it("should try to resolve the config file to the cwd if it is relative", async () => {
      // We don't test the output here because file.json will not resolve to a real file when testing
      await client(["file.css", "--config", "file.json"]);

      expect(resolve.sync).toBeCalled();
    });

    it("should turn the config file path into an absolute path if it is relative", async () => {
      const { socket } = setup();

      await client(["file.css", "--config", "file.json"]);

      expect(socket.send).toBeCalledWith({
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          files: ["file.css"],
          configFile: `${process.cwd()}/file.json`,
          formatter: "string",
        },
      });
    });

    it("should add the config basedir to arguments if provided", async () => {
      const { socket } = setup();

      await client(["file.css", "--configBasedir", "/some/configbasedir"]);

      expect(socket.send).toBeCalledWith({
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          files: ["file.css"],
          configBasedir: "/some/configbasedir",
          formatter: "string",
        },
      });
    });

    it("should make the config basedir argument absolute if it is a relative path", async () => {
      const { socket } = setup();

      await client(["file.css", "--configBasedir", "configbasedir"]);

      expect(socket.send).toBeCalledWith({
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          files: ["file.css"],
          configBasedir: `${process.cwd()}/configbasedir`,
          formatter: "string",
        },
      });
    });

    it("should make the config basedir argument absolute if it is a relative path", async () => {
      const { socket } = setup();

      await client(["file.css", "--configBasedir", "configbasedir"]);

      expect(socket.send).toBeCalledWith({
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          files: ["file.css"],
          configBasedir: `${process.cwd()}/configbasedir`,
          formatter: "string",
        },
      });
    });

    it("should add customFormatter to the arguments if provided", async () => {
      const { socket } = setup();

      await client(["file.css", "--customFormatter", "/some/custom/formatter.js"]);

      expect(socket.send).toBeCalledWith({
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          files: ["file.css"],
          customFormatter: "/some/custom/formatter.js",
          formatter: "string",
        },
      });
    });

    it("should attempt to resolve the customFromatter file if it's relative", async () => {
      await client(["file.css", "--customFormatter", "formatter.js"]);

      expect(resolve.sync).toBeCalled();
    });

    it("should add make the customFormatter path absolute if it's relative", async () => {
      const { socket } = setup();

      await client(["file.css", "--customFormatter", "formatter.js"]);

      expect(socket.send).toBeCalledWith({
        command: Command.LINT,
        cwd: expect.any(String),
        lintArguments: {
          files: ["file.css"],
          customFormatter: `${process.cwd()}/formatter.js`,
          formatter: "string",
        },
      });
    });

    it("should respond with the lint output", async () => {
      const { socket } = setup();

      socket.getData.mockResolvedValueOnce({
        command: Command.LINT,
        output: "some output",
        errored: false,
      });

      expect(await client(["file.css"])).toStrictEqual({
        message: "some output",
        code: 0,
      });
    });

    it("should add a nonzero code if the lint responded with errored as true", async () => {
      const { socket } = setup();

      socket.getData.mockResolvedValueOnce({
        command: Command.LINT,
        output: "some other output",
        errored: true,
      });

      expect(await client(["file.css"])).toStrictEqual({
        message: "some other output",
        code: 2,
      });
    });
  });
});

function setup() {
  (MockedSocket.createClientSocket as jest.MockedFunction<
    typeof MockedSocket.createClientSocket
  >).mockImplementation((): Promise<Socket> => Promise.resolve(MockedSocket.prototype));

  MockedSocket.prototype.getData.mockResolvedValue({});

  return { socket: MockedSocket.prototype };
}
