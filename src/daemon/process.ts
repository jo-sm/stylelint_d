import { Server } from "../Server";

const instance = new Server();

process.title = "stylelint_d";
process.removeAllListeners();
process.on("SIGTERM", kill);
process.on("SIGINT", kill);

instance.on("stop", () => {
  process.exit(0);
});

instance.on("log", (message) => {
  console.log(message.message);
});

/**
 * Stop the server and kill the process.
 */
function kill() {
  instance.end();

  process.exit(0);
}
