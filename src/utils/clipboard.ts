import { execFile } from "node:child_process";

async function pipeTo(command: string, args: string[], text: string) {
  const child = execFile(command, args);
  child.stdin?.end(text);
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${String(code)}`));
    });
  });
}

export async function copyToClipboard(text: string): Promise<boolean> {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      await pipeTo("pbcopy", [], text);
      return true;
    }
    if (platform === "win32") {
      await pipeTo("clip", [], text.replace(/\n/g, ""));
      return true;
    }
    try {
      await pipeTo("xclip", ["-selection", "clipboard"], text);
      return true;
    } catch {
      await pipeTo("xsel", ["--clipboard", "--input"], text);
      return true;
    }
  } catch {
    return false;
  }
}
