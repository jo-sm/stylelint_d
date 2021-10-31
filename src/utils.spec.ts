import * as utils from "./utils";
import net from "net";
import { spawn as spawnChildProcess } from "child_process";

jest.mock("net");

jest.mock("child_process", () => ({
  spawn: jest.fn().mockReturnValue({ unref: () => {} }),
}));

const Socket = net.Socket as jest.MockedClass<typeof net.Socket>;

describe("utils", () => {
  let socketOnceHandlers: { [key: string]: any } = {};

  beforeEach(() => {
    Socket.prototype.once.mockImplementation((eventName: string, cb: any): any => {
      socketOnceHandlers[eventName] = cb;
    });
  });

  afterEach(() => {
    socketOnceHandlers = {};
  });

  describe("encode", () => {
    it("should transform a JSON serializable object into a base64 string", () => {
      expect(utils.encode({ hello: "world" })).toBe("eyJoZWxsbyI6IndvcmxkIn0=");
    });
  });

  describe("decode", () => {
    it("should transform a base64 string into an object", () => {
      expect(utils.decode("eyJoZWxsbyI6IndvcmxkIn0=")).toStrictEqual({ hello: "world" });
    });
  });

  describe("readStdin", () => {
    let eventHandlers: { [key: string]: any } = {};
    let onSpy: jest.SpyInstance;
    let readSpy: jest.SpyInstance;

    beforeEach(() => {
      readSpy = jest.spyOn(process.stdin, "read").mockImplementation(() => {});
      onSpy = jest
        .spyOn(process.stdin, "on")
        .mockImplementation((eventName: string, cb: any): any => {
          eventHandlers[eventName] = cb;
        });
    });

    afterEach(() => {
      onSpy.mockRestore();
      readSpy.mockRestore();
      eventHandlers = {};
    });

    it("should return an empty string if nothing was read from stdin when the steam ended", async () => {
      const resultPromise = utils.readStdin();

      eventHandlers.end();

      expect(await resultPromise).toBe("");
    });

    it("should return a concatenated string of non-null values read from stdin", async () => {
      const resultPromise = utils.readStdin();

      ["hello", null, 2, "world"].forEach((value) => {
        readSpy.mockReturnValueOnce(value);
        eventHandlers.readable();
      });

      eventHandlers.end();

      expect(await resultPromise).toBe("hello2world");
    });
  });

  describe("splitIntoChunks", () => {
    it("should throw if given a number that is not a positive integer", () => {
      expect(() => utils.splitIntoChunks("hello", -1)).toThrow();
      expect(() => utils.splitIntoChunks("hello", 3.5)).toThrow();
      expect(() => utils.splitIntoChunks("hello", NaN)).toThrow();
      expect(() => utils.splitIntoChunks("hello", Infinity)).toThrow();
    });

    it("should return one string if the length of the string is less than the chunkSize", () => {
      expect(utils.splitIntoChunks("hello")).toStrictEqual(["hello"]);
    });

    it("should return the correct number of strings based on the chunkSize", () => {
      expect(utils.splitIntoChunks("hello", 1)).toStrictEqual(["h", "e", "l", "l", "o"]);
      expect(utils.splitIntoChunks("hello", 2)).toStrictEqual(["he", "ll", "o"]);
      expect(utils.splitIntoChunks("hello", 3)).toStrictEqual(["hel", "lo"]);
      expect(utils.splitIntoChunks("hello", 5)).toStrictEqual(["hello"]);
      expect(utils.splitIntoChunks("hello", 999)).toStrictEqual(["hello"]);
    });
  });

  describe("daemonRunning", () => {
    it("should resolve true if the socket is able to connect to the server", async () => {
      const promise = utils.daemonRunning();

      socketOnceHandlers.connect();

      await expect(promise).resolves.toBe(true);
    });

    it("should resolve false if the socket fails to conenct to the server", async () => {
      const promise = utils.daemonRunning();

      socketOnceHandlers.error();

      await expect(promise).resolves.toBe(false);
    });
  });

  describe("spawnDaemon", () => {
    it("should attempt to spawn a daemon", async () => {
      const promise = utils.spawnDaemon();

      socketOnceHandlers.error();

      await promise;

      expect(spawnChildProcess).toHaveBeenCalledWith("node", [expect.any(String)], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });
    });

    it("should reject if a daemon is already running", async () => {
      const promise = utils.spawnDaemon();

      socketOnceHandlers.connect();

      await expect(promise).rejects.toThrow();
    });
  });

  describe("getNetSocket", () => {
    it("should resolve with a net.Socket instance connected to the server", async () => {
      const promise = utils.getNetSocket();

      socketOnceHandlers.connect();

      const socket = await promise;

      expect(socket.connect).toHaveBeenCalledWith({ port: 48126, host: "127.0.0.1" });
      expect(socket).toBeInstanceOf(net.Socket);
    });

    it("should reject if it cannot connect to the server", async () => {
      const promise = utils.getNetSocket();

      socketOnceHandlers.error();

      await expect(promise).rejects.toThrow();
    });
  });
});
