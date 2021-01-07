import net from "net";
import { Defer } from "./Defer";
import * as childProcess from "child_process";
import { PORT as SERVER_PORT } from "./Server";

/**
 * Encodes given `object` into a base64 string of the JSON-serialized object.
 *
 * Throws if the object is not serializable by `JSON.stringify`.
 *
 * @returns The base64 encoded object.
 */
export function encode<T>(obj: T): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

/**
 * Decodes a base64 string into an object of type `T`.
 *
 * Throws if the intermediate parsed base64 string can't be parsed as JSON.
 *
 * @returns an object of type `T`.
 */
export function decode<T>(encoded: string): T {
  const debuffered = Buffer.from(encoded, "base64").toString();

  return JSON.parse(debuffered);
}

/**
 * Returns the string read from `process.stdin`.
 *
 * @return a promise that resolves to the data read from `process.stdin`.
 */
export async function readStdin(): Promise<string> {
  const defer = new Defer<string>();

  const chunks: string[] = [];

  process.stdin.on("readable", function () {
    const chunk = process.stdin.read();

    if (chunk !== null) {
      chunks.push(chunk);
    }
  });

  process.stdin.on("end", () => defer.resolve(chunks.join("")));

  return defer.promise;
}

/**
 * Splits a string into an array of stings, where each string is, at most, length `chunkSize`.
 *
 * @param  string Input string.
 * @param   chunkSize The size of the strings in the array. Default `512`.
 *
 * @returns an array of strings.
 */
export function splitIntoChunks(string: string, chunkSize = 512): string[] {
  if (chunkSize <= 0 || !Number.isInteger(chunkSize)) {
    throw new Error("chunkSize must be a positive integer");
  }

  if (string.length <= chunkSize) {
    return [string];
  }

  const result = [];
  let currentIteration = 0;

  while (string.length > currentIteration * chunkSize) {
    result.push(string.slice(chunkSize * currentIteration, chunkSize * (currentIteration + 1)));

    currentIteration++;
  }

  return result;
}

/**
 * Returns if a daemon is running currently.
 *
 * @return {Promise<boolean>}
 */
export async function daemonRunning(): Promise<boolean> {
  const defer = new Defer<boolean>();

  try {
    const socket = await getNetSocket();
    socket.destroy();

    defer.resolve(true);
  } catch {
    defer.resolve(false);
  }

  return defer.promise;
}

/**
 * Spawns a new daemonized process of `Server`. Throws if a daemon is already running.
 * @return {Promise<boolean>}
 */
export async function spawnDaemon(): Promise<boolean> {
  if (await daemonRunning()) {
    throw new Error("Daemon already running");
  }

  const daemon = require.resolve("../src/daemon/tty");
  const child = childProcess.spawn("node", [daemon], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();

  return true;
}

export async function getNetSocket(): Promise<net.Socket> {
  const defer = new Defer<net.Socket>();
  const socket = new net.Socket();

  socket.once("connect", () => defer.resolve(socket));
  socket.once("error", () => {
    defer.reject(new Error("Could not connect to daemon"));
    socket.destroy();
  });

  socket.connect({ host: "127.0.0.1", port: SERVER_PORT });

  return defer.promise;
}
