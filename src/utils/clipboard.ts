import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function copyToClipboard(text: string): Promise<boolean> {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      await execAsync(`echo ${JSON.stringify(text)} | pbcopy`);
      return true;
    }
    if (platform === "win32") {
      await execAsync(`echo ${text.replace(/\n/g, "")} | clip`);
      return true;
    }
    try {
      await execAsync(
        `echo ${JSON.stringify(text)} | xclip -selection clipboard`,
      );
      return true;
    } catch {
      await execAsync(
        `echo ${JSON.stringify(text)} | xsel --clipboard --input`,
      );
      return true;
    }
  } catch {
    return false;
  }
}
