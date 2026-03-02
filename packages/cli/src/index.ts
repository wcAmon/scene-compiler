#!/usr/bin/env node --import tsx
import { Command } from "commander";
import { runValidate } from "./commands/validate.js";
import { runInit } from "./commands/init.js";
import { runBuild } from "./commands/build.js";

const program = new Command();

program
  .name("scene")
  .description("Scene Compiler CLI — validate, init, and build game scenes")
  .version("0.1.0");

program
  .command("validate")
  .description("Validate scene source files against budget rules")
  .argument("[dir]", "source directory to validate", "src/")
  .option(
    "-b, --budget <path>",
    "path to game.budget.json",
  )
  .action((dir: string, opts: { budget?: string }) => {
    const exitCode = runValidate(dir, opts);
    process.exit(exitCode);
  });

program
  .command("init")
  .description("Initialize a game.budget.json config in the current directory")
  .action(() => {
    const exitCode = runInit();
    process.exit(exitCode);
  });

program
  .command("build")
  .description("Validate source files and run Vite build")
  .argument("[dir]", "source directory to validate", "src/")
  .option(
    "-b, --budget <path>",
    "path to game.budget.json",
  )
  .action((dir: string, opts: { budget?: string }) => {
    const exitCode = runBuild(dir, opts);
    process.exit(exitCode);
  });

program.parse();
