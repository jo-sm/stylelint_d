import { LintResult } from "stylelint";

export const separator = "stylelint_d_separator";

export function generateError(message: string, format = "string"): string | LintResult[] {
  const prefix = "Could not lint file";

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
        source: "",
        deprecations: [],
        invalidOptionWarnings: [],
        errored: undefined,
        ignored: undefined,
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

export function validCommand(command?: string): boolean {
  const validCommands = ["stop", "start", "restart"];

  if (typeof command !== "string") {
    return false;
  }

  if (validCommands.includes(command)) {
    return false;
  }

  return true;
}
