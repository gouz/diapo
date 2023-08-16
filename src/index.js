#!/usr/bin/env bun
import { watch } from "fs";
import readline from "readline";
import process from "process";
import chalk from "chalk";
import { program } from "commander";
import open from "open";
import Interpreter from "./core/Interpreter";
import Server from "./core/Server";
import packagejson from "../package.json";

const { log, error } = console;
const joliTitle = chalk.hex("#16cedd");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const flow = (talk, options = {}, init = false) => {
  Interpreter.convert(`./${talk}/main.sdf`, options)
    .then(async (html) => {
      if (options.save) {
        Object.entries(html).forEach(([key, value]) => {
          // eslint-disable-next-line no-undef
          Bun.write(`./${talk}/${key}.html`, value.html);
        });
      } else if (init) {
        Server.create(html, options, `${process.cwd()}/${talk}`);
        if (options.open) {
          if (options.notes)
            await open(`http://localhost:${options.port}/notes`);
          await open(`http://localhost:${options.port}`);
        }
      } else {
        Server.setHTML(html);
      }
    })
    .catch((err) => error(err));
};

program
  .argument("<talk>")
  .option("-p, --port <int>", "port", 1337)
  .option("-o, --open", "open the default browser")
  .option("-s, --save", "save the html file")
  .option("-n, --notes", "open with speakers notes")
  .option("-src, --source", "add a button on slides to display its SDF code")
  .option(
    "--gamepad",
    "control your slide with a gamepad from the presentation",
  )
  .option(
    "--gamepad-sv",
    "control your slide with a gamepad from the speaker-view",
  )
  .option("--qrcode", "add a QRCode on each slide")
  .description("Convert & present a talk")
  .action((talk, options) => {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    log(
      joliTitle(`
░██████╗██╗░░░░░██╗██████╗░███████╗░██████╗██╗░░██╗
██╔════╝██║░░░░░╚═╝██╔══██╗██╔════╝██╔════╝██║░██╔╝
╚█████╗░██║░░░░░██║██║░░██║█████╗░░╚█████╗░█████═╝░
░╚═══██╗██║░░░░░██║██║░░██║██╔══╝░░░╚═══██╗██╔═██╗░
██████╔╝███████╗██║██████╔╝███████╗██████╔╝██║░╚██╗
╚═════╝░╚══════╝╚═╝╚═════╝░╚══════╝╚═════╝░╚═╝░░╚═╝
                                            v${packagejson.version}
`),
      chalk.underline(
        "\n\nTake the control of your presentation direct from here.",
      ),
      "\n",
      `\nPress ${chalk.italic("Enter")} to go to the next slide.`,
      `\nPress ${chalk.italic("P + Enter")} to go to the previous slide.`,
      `\nPress ${chalk.italic("Q")} to quit the program.`,
      "\n",
    );
    flow(talk, options, true);
    if (!options.save) {
      watch(talk, { recursive: true }, (eventType, filename) => {
        log(`♻️  ${filename} is ${eventType}`);
        flow(talk, options);
      });
    }
  });

program.version(packagejson.version, "-v, --version");

const getAction = () => {
  rl.question("", (answer) => {
    const i = answer.trim().toLowerCase();
    if (i === "q") process.exit();
    else if (i === "p") Server.send("previous");
    else Server.send("next");
    readline.moveCursor(process.stdout, 0, -2);
    readline.clearScreenDown(process.stdout);
    getAction();
  });
};

getAction();

program.parse();
