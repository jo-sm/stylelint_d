var separator = "stylelint_d_separator";

function generateError(message, format) {
  var prefix = "Could not lint file";

  if (message) {
    message = `${prefix}: ${message}`;
  } else {
    message = prefix;
  }

  if (format === "string") {
    return `${message}`;
  } else {
    return [
      {
        deprecations: [],
        invalidOptionWarnings: [],
        warnings: [
          {
            line: 0,
            column: 0,
            rule: "could-not-lint",
            severity: "error",
            text: message,
          },
        ],
      },
    ];
  }
}

function validCommand(command) {
  var validCommands = ["stop", "start", "restart"];

  if (typeof command !== "string") {
    return false;
  }

  if (validCommands.indexOf(command) === -1) {
    return false;
  }

  return true;
}

module.exports = {
  separator: separator,
  generateError: generateError,
  validCommand: validCommand,
};
