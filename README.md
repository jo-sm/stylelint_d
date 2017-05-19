# stylelint_d

`stylelint_d` is a long running `stylelint` daemon that makes CSS linting much faster compared to the `stylelint` CLI. Instead of starting a Node process each time you lint, which is slow and can take 500ms+ to start the node process, this creates a server which listens for filenames (as well as a few commands) and lints the given files, returning the output to the client significantly faster. The time to lint is reduced to just the time `stylelint` will take to run. The main use case is for time dependent processes, like linting in a code editor.

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

`stylelint_d` is less robust than the `stylelint` CLI, and does not accept most of the options that the main CLI does; `stylelint_d` only accepts the specific commands explained below, as well as file globs, as parameters. If you need to use the CLI options, please use the standard `stylelint` CLI. If there is a specific flag you need, create an issue and I can add it in.

To lint a file, run:

```
> stylelint_d <path/to/file.css>
# You can also pass file globs
> stylelint_d <path/to/css/**/*.css>
```

It will automatically find your `stylelint` configuration based on the path of the file. You can also optionally pass the `--config` or `-c` flag to denote the config file location. Note that the first time you run the linter, it will take a moment to initially start the node process and import the `stylelint` module, but subsequent imports will be cached and lint execution will be much faster.

`stylelint_d` also accepts input via stdin. Note you must supply either the config file location, or a file or directory name when running with stdin, or else `stylelint` won't be able to find the config. If you supply the config file directly, if you don't supply the absolute path, `stylelint_d` will take the cwd of the `stylelint_d` process.

```
> cat ./asset.css | stylelint_d --stdin --file asset.css
> cat ./asset.css | stylelint_d --stdin --config ./.stylelintrc
```

You can specify the formatter using the `--formatter` flag, defaulting to `string`. The valid options are `string` and `json`. (see [Stylelint API #formatter](https://github.com/stylelint/stylelint/blob/master/docs/user-guide/node-api.md#formatter) for more details).

In addition to aforementioned flags, stylelint_d also accepts the following commands:

```
# Stop the current running server
> stylelint_d stop
# Start a new server
> stylelint_d start
# Restart the server
> stylelint_d restart
```

## Troubleshooting

`stylelint_d` listens on `127.0.0.1:48126`. If for some reason linting isn't working, or returns strange results, check that the port is not in use by another process.

## Issues and Pull Requests

If you find an issue or bug, create an issue with the following information: your `stylelint_d` version, `stylelint` version, OS, and the layout of the config file and files that you're attempting to lint. If you received a stack trace, include that as well.

I welcome PRs! 

## License

MIT