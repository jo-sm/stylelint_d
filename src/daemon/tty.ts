import { spawn } from "node-pty";

const path = require.resolve("./process");

const tty = spawn("node", [path], {
  name: "fake-tty",
  // TODO: allow this to be resized (180 may be too wide)
  cols: 180,
  rows: 30,
  env: process.env as any,
  cwd: process.cwd(),
});

tty.onData((data) => process.stdout.write(data));
