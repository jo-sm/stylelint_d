import type { LinterResult } from "stylelint";

export enum Command {
  LINT = "lint",
  VERSION = "version",
  START = "start",
  STOP = "stop",
  RESTART = "restart",
  STATUS = "status",
  HELP = "help",
  __TEST__ = "__test__",
}

export interface LintArguments {
  files?: string[];
  stdin?: boolean;
  stdinFilename?: string;
  code?: string;
  codeFilename?: string;

  quiet?: boolean;
  configOverrides?: {
    quiet?: boolean;
  };

  config?: string;
  configFile?: string;
  configBasedir?: string;

  customFormatter?: string;
}

interface NonLintRequest {
  command: Command.STOP | Command.RESTART | Command.__TEST__;
}

export interface LintRequest {
  cwd: string;
  command: Command.LINT;
  lintArguments: LintArguments;
}

export type Request = LintRequest | NonLintRequest;

interface ErrorResponse {
  status: "error";
  command: Command | "unknown";
  message: string;
  metadata?: { code?: number };
}

interface NonLintResponse {
  status: "ok";
  command: Command.STOP | Command.RESTART | Command.__TEST__;
  message: string;
}

interface LintResponse {
  status: "ok";
  command: Command.LINT;
  result: LinterResult;
}

export type Response = ErrorResponse | NonLintResponse | LintResponse;

export interface ClientResult {
  message: string;
  code?: number;
}
