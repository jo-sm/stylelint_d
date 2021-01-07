import net from "net";
import { encode, decode, splitIntoChunks, getNetSocket } from "./utils";
import { Defer } from "./Defer";

type SocketKind = "client" | "server";

/**
 * Provides a thin wrapper over `net.Socket`, simplifying its use with the `allowHalfOpen` option
 * used during `net.Server` instantiation. See `Server.createInstance`.
 */
export class Socket {
  private rawSocket: net.Socket;
  private kind: SocketKind;
  private dataDefer: Defer<any>;
  private ended = false;
  private closed = false;

  /**
   * Create a socket connected to the server that will return data via `#getData`
   * when the `close` event is fired on the socket.
   *
   * @returns A new Socket instance of kind `client`
   */
  static async createClientSocket(): Promise<Socket> {
    let rawSocket;

    try {
      rawSocket = await getNetSocket();
    } catch {
      return this.createClientSocket();
    }

    return new Socket(rawSocket, "client");
  }

  /**
   * Creates a socket that returns data via `#getData` via the `close` or `end` event,
   * depending on the `kind` of `Socket`.
   *
   * If `Socket` is of kind `client`, it will wait until it gets the `close` event;
   * if it is of kind `server`, it will wait until the `end` event.
   *
   * @param rawSocket `net.Socket` instance
   * @param kind   `client` or `server`. Denotes if this socket is used on the server or client side. In
   *                        general the client doesn't make an instance directly, instead it uses
   *                        `.createClientSocket`.
   */
  constructor(rawSocket: net.Socket, kind: SocketKind) {
    this.rawSocket = rawSocket;
    this.kind = kind;
    this.dataDefer = new Defer<any>();

    this.setupListeners();
  }

  /**
   * Getter that returns if the socket can have data sent on it.
   * @return {boolean} [description]
   */
  get writable(): boolean {
    if (this.kind === "server") {
      // The server side is only writeable if the client has ended the connection
      // but it hasn't been closed yet
      return this.ended && !this.closed;
    } else {
      return !this.ended;
    }
  }

  /**
   * Send data of type `T` on the socket (as multiple chunks of 512 characters) and call
   * `socket.end` once all data has been written.
   *
   * @returns always true.
   */
  async send<T>(data: T): Promise<boolean> {
    const encoded = encode<T>(data);
    const chunks = splitIntoChunks(encoded);

    chunks.forEach((chunk) => this.rawSocket.write(chunk));

    await new Promise<void>((resolve) => this.rawSocket.end(resolve));

    return true;
  }

  /**
   * Resolve data once the appropriate event has been fired on the socket.
   *
   * If the instance is of kind `client`, it will resolve when the `close` event
   * is fired. If it is of kind `server`, it will resolve when the `end` event is
   * fired.
   *
   * @returns A promise which resolves to object of given type `T`.
   */
  async getData<T>(): Promise<T> {
    const data = await this.dataDefer.promise;

    return data;
  }

  /**
   * Sets up listeners on `data` and either `close` or `end`, depending on the kind
   * of the instance.
   *
   * The `data` event listener will just collect the buffer data.
   *
   * The `close`/`end` listener will decode the collected data and resolve the internal
   * deferred promise that allows `#getData` to resolve. If the data fails to decode it
   * will reject that promise.
   */
  private setupListeners() {
    const buffers: Buffer[] = [];

    const handleDecode = () => {
      if (buffers.length === 0) {
        this.dataDefer.resolve();
        this.rawSocket.destroy();
        return;
      }

      let data;

      try {
        data = decode(Buffer.concat(buffers).toString("ascii"));
      } catch (err) {
        this.dataDefer.reject(new Error("Could not parse socket data"));
        return;
      }

      this.dataDefer.resolve(data);
    };

    this.rawSocket.on("data", (buf) => {
      buffers.push(buf);
    });

    this.rawSocket.on("end", () => {
      if (this.kind === "server") {
        handleDecode();
      }

      this.ended = true;
    });

    this.rawSocket.on("close", () => {
      if (this.kind === "client") {
        handleDecode();
      }

      this.closed = true;
    });
  }
}
