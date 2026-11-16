import { fileURLToPath } from "node:url";

export const USAGE = `Usage: chebot <command>

Commands:
  ask "<question>"   run the protocol on one question
  eval               run the evaluation set`;

export function run(argv: string[]): { code: number; message: string } {
  const [command] = argv;
  if (command === "ask" || command === "eval") {
    return { code: 1, message: "not implemented yet" };
  }
  return { code: 2, message: USAGE };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, message } = run(process.argv.slice(2));
  (code === 0 ? console.log : console.error)(message);
  process.exitCode = code;
}
