# stylelint_d

`stylelint_d` is a long running `stylelint` daemon that makes CSS linting much faster compared to the `stylelint` CLI. Instead of starting a Node process each time you lint, which is slow and can take 700ms+, this creates a server which listens for filenames (as well as a few commands) and lints the given files, returning the output to the client significantly faster, in 100-150ms. The main use case is for code editors or linting processes that are time dependent.

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

`stylelint_d` is much less robust than the `stylelint` CLI, and does not accept any of the options that the CLI does; `stylelint_d` only accepts the specific commands explained below, as well as file globs, as parameters. If you need to use the CLI options, please use the standard `stylelint` CLI.

To lint a file, run:

```
> stylelint_d <path/to/file.css>
# You can also pass file globs
> stylelint_d <path/to/css/**/*.css>
```

It will automatically find your `stylelint` configuration based on the path of the file. You can also optionally pass the `--config` or `-c` flag to denote the config file location. Note that the first time you run the linter, it may take a moment to start node, but afterwards it will be much faster.

`stylelint_d` also accepts input via stdin. Note you must supply either the config file location, or a file or directory name when running with stdin, or else `stylelint` won't be able to find the config. If you supply the config file directly, if you don't supply the absolute path, `stylelint_d` will take the cwd of the `stylelint_d` process.

```
> cat ./asset.css | stylelint_d --stdin --file asset.css
> cat ./asset.css | stylelint_d --stdin --config ./.stylelintrc
```

In addition to accepting file globs and stdin, stylelint_d also accepts the following commands:

```
# Stop the current running server
> stylelint_d stop
# Start a new server
> stylelint_d start
# Restart the server
> stylelint_d restart
```

## License

MIT