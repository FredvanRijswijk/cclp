import { spawn } from "node:child_process";
import type { Project } from "./scanner.js";

export function launchClaude(project: Project): void {
  const child = spawn("claude", [], {
    cwd: project.path,
    stdio: "inherit",
  });

  child.on("error", (err) => {
    console.error(`Failed to launch claude: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
