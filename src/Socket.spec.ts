import net from "net";
import { Socket } from "./Socket";
import * as utils from "./utils";

jest.mock("./utils", () => ({
  ...jest.requireActual("./utils"),
  getNetSocket: jest.fn(),
}));

const wait = () => new Promise((resolve) => process.nextTick(resolve));

// {} in JSON
const mockJSONBuffer = Buffer.from("e30=");

describe("Socket", () => {
  let getNetSocketSpy: jest.Mock;
  let eventHandlers: any = {};

  beforeEach(() => {
    getNetSocketSpy = (utils.getNetSocket as unknown as jest.Mock).mockImplementation(
      (): Promise<net.Socket> => {
        const result: any = {
          on: jest.fn((eventName: string, cb: any) => {
            eventHandlers[eventName] = cb;
          }),
          end: jest.fn(),
          write: jest.fn(),
          destroy: jest.fn(),
        } as unknown as net.Socket;

        return Promise.resolve(result);
      },
    );
  });

  afterEach(() => {
    getNetSocketSpy.mockRestore();
    eventHandlers = {};
  });

  describe(".createClientSocket", () => {
    it("should return a new Socket instance with a new socket (via getNetSocket)", async () => {
      const socket = await Socket.createClientSocket();

      expect(socket).toBeInstanceOf(Socket);
      expect(utils.getNetSocket).toHaveBeenCalledTimes(1);
    });

    it("should attempt to make a new socket until one is successfully created", async () => {
      getNetSocketSpy.mockRejectedValueOnce(new Error("could not connect"));
      getNetSocketSpy.mockRejectedValueOnce(new Error("could not connect"));
      getNetSocketSpy.mockRejectedValueOnce(new Error("could not connect"));

      await Socket.createClientSocket();

      expect(utils.getNetSocket).toHaveBeenCalledTimes(4);
    });
  });

  describe("instantiation", () => {
    it("should setup listeners on the given net.Socket instance", async () => {
      const rawSocket = await utils.getNetSocket();

      new Socket(rawSocket, "client");

      expect(rawSocket.on).toHaveBeenCalledWith("data", expect.any(Function));
      expect(rawSocket.on).toHaveBeenCalledWith("close", expect.any(Function));
      expect(rawSocket.on).toHaveBeenCalledWith("end", expect.any(Function));
    });
  });

  describe("#writable", () => {
    it(`should return true once the socket fires the "end" event, if the instance is of kind server`, async () => {
      const rawSocket = await utils.getNetSocket();

      const socket = new Socket(rawSocket, "server");

      expect(socket.writable).toBe(false);

      eventHandlers.data(mockJSONBuffer);
      eventHandlers.end();

      expect(socket.writable).toBe(true);

      eventHandlers.close();

      expect(socket.writable).toBe(false);
    });

    it(`should return true once the socket fires the "closed" event, if the instance is of kind client`, async () => {
      const rawSocket = await utils.getNetSocket();

      const socket = new Socket(rawSocket, "client");

      expect(socket.writable).toBe(true);

      eventHandlers.data(mockJSONBuffer);
      eventHandlers.end();

      expect(socket.writable).toBe(false);

      eventHandlers.close();

      expect(socket.writable).toBe(false);
    });
  });

  describe("#send", () => {
    it("should write an encoded string over the socket and call socket.end afterwards", async () => {
      const data = { hello: "world" };

      const rawSocket = await utils.getNetSocket();
      const socket = new Socket(rawSocket, "client");

      socket.send(data);

      expect(rawSocket.write).toHaveBeenCalledTimes(1);
      expect(rawSocket.write).toHaveBeenCalledWith(utils.encode(data));
      expect(rawSocket.end).toHaveBeenCalled();
    });

    it(`should break data that's larger than 512 characters into multiple chunks`, async () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((item) => ({
        hello: "world",
        key: item,
        key2: item,
        key3: item,
      }));

      const rawSocket = await utils.getNetSocket();
      const socket = new Socket(rawSocket, "client");

      socket.send(data);

      const encodedData = utils.splitIntoChunks(utils.encode(data));

      expect(rawSocket.write).toHaveBeenCalledTimes(2);
      expect(rawSocket.write).toHaveBeenNthCalledWith(1, encodedData[0]);
      expect(rawSocket.write).toHaveBeenNthCalledWith(2, encodedData[1]);
    });
  });

  describe("#getData", () => {
    it("should resolve data when the socket end event is fired and the instance is of kind server", async () => {
      const rawSocket = await utils.getNetSocket();
      const socket = new Socket(rawSocket, "server");

      let data;

      socket.getData().then((result) => (data = result));

      await wait();
      expect(data).toBeUndefined();

      eventHandlers.data(mockJSONBuffer);

      await wait();
      expect(data).toBeUndefined();

      eventHandlers.end();

      await wait();
      expect(data).toBeDefined();
    });

    it("should resolve data when the socket close event is fired and the instance is of kind client", async () => {
      const socket = await Socket.createClientSocket();

      let data;

      socket.getData().then((result) => (data = result));

      await wait();
      expect(data).toBeUndefined();

      eventHandlers.data(mockJSONBuffer);

      await wait();
      expect(data).toBeUndefined();

      eventHandlers.end();

      await wait();
      expect(data).toBeUndefined();

      eventHandlers.close();

      await wait();
      expect(data).toBeDefined();
    });

    it("should reject if the data could not be properly decoded", async () => {
      const socket = await Socket.createClientSocket();

      eventHandlers.data(Buffer.from("gibberish"));
      eventHandlers.close();

      await expect(socket.getData()).rejects.toBeInstanceOf(Error);
    });

    it("should resolve with nothing and destroy the socket if no data was sent", async () => {
      const rawSocket = await utils.getNetSocket();
      const socket = new Socket(rawSocket, "server");

      eventHandlers.end();

      expect(await socket.getData()).toBeUndefined();
      expect(rawSocket.destroy).toHaveBeenCalled();
    });
  });
});
