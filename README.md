# stylelint_d

`stylelint_d` is a long running `stylelint` daemon that makes CSS linting much faster compared to the official `stylelint` CLI. It works by creating a daemonized "server" that handles linting, reducing the time it take to run `stylelint` to only the time it takes to actually lint, without the overhead of instantiating a new Node process. Its main use is for time dependent processes, like linting in a code editor.

Thanks to [eslint_d](https://github.com/mantoni/eslint_d.js) by [Maximilian Antoni](https://github.com/mantoni) for the idea!

## Install

```
> npm install stylelint_d
```

To install globally for all projects:

```
> npm install -g stylelint_d
```

## Usage

`stylelint_d` aims to be as compatible with `stylelint` as possible, and acts as a very thin wrapper on top of `stylelint` as much as possible. This means that you should be able to pass any argument to the command line and can expect it to work as it does in the official `stylelint` CLI. For details on the available flags, please see the [official Stylelint CLI documentation](https://stylelint.io/user-guide/usage/cli).

### Server commands

In addition to the flags supported by the official CLI, you can also get information about the running daemon by using the following commands:

```bash
# Get the status of the daemon (is it running or not?)
> npx stylelint_d status

# Start the daemon if it isn't running
> npx stylelint_d start

# Restart the daemon
> npx stylelint_d restart

# Stop the daemon
> npx stylelint_d stop
```

You will get an error message (and a nonzero status code) if you try to run one of the commands in an invalid state, e.g. trying to start when `stylelint_d` is already running.

### `stylelint` module resolution

`stylelint_d` tries to use the `stylelint` package that can be resolved in the path of, in order, 1. path of the config file, 2. path of the first given CSS file, 3. path of the glob, 4. the path where you invocated `stylelint_d`. This means that whichever version of `stylelint` that you use should be detected and used by the daemon.

However, if for some reason it cannot detect a valid `stylelint` package in any of the above, `stylelint_d` will instead use its built-in version of `stylelint`.

## Troubleshooting

### Cannot start daemon

If you have issues starting the daemon, make sure that no other process is using port `48126`.

### Weird lint results

If you experience linting related issues and aren't getting correct results, stop the daemonized version and run the following command:

```bash
> node ./node_modules/stylelint_d/dist/src/daemon.js
```

And try to lint your file again. If you get a stack trace or some unexpectedly logged error, please create an issue.

## Issues and Pull Requests

If you find an bug or something isn't quite right, create an issue with the following information: your `stylelint_d` version, `stylelint` version, OS, and the layout of the config file and files that you're attempting to lint. If you received a stack trace, include that as well.

I welcome PRs! 🙂

## License

MIT
