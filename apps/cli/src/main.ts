import { fileURLToPath } from "node:url";
import { ASK_USAGE, type AskDeps, ask, gatewayDeps, parseAskArgs } from "./ask.ts";
import { EVAL_USAGE, evaluate, parseEvalArgs } from "./eval/eval.ts";

export const USAGE = `Usage: chebot <command>

Commands:
  ask "<question>"   run the protocol on one question
  eval --set <file>  run the evaluation set

${ASK_USAGE}

${EVAL_USAGE}`;

export async function run(
  argv: string[],
  deps: () => AskDeps = gatewayDeps,
): Promise<{ code: number; message: string }> {
  const [command, ...rest] = argv;
  if (command === "ask") {
    const args = parseAskArgs(rest);
    if ("error" in args) return { code: 2, message: `${args.error}\n\n${ASK_USAGE}` };
    try {
      const result = await ask(args, deps());
      return { code: result.code, message: result.message };
    } catch (error) {
      return { code: 1, message: error instanceof Error ? error.message : String(error) };
    }
  }
  if (command === "eval") {
    const args = parseEvalArgs(rest);
    if ("error" in args) return { code: 2, message: `${args.error}\n\n${EVAL_USAGE}` };
    try {
      const result = await evaluate(args, deps());
      return { code: result.code, message: result.message };
    } catch (error) {
      return { code: 1, message: error instanceof Error ? error.message : String(error) };
    }
  }
  return { code: 2, message: USAGE };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, message } = await run(process.argv.slice(2));
  (code === 0 ? console.log : console.error)(message);
  process.exitCode = code;
}
