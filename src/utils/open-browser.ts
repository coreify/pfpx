import { execFile } from "node:child_process";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) {
        reject(new Error("Failed to launch browser", { cause: error }));
      }
      else resolve();
    });
  });
}

export async function openInBrowser(url: string): Promise<void> {
  const platform = process.platform;
  if (platform === "darwin") {
    await run("open", [url]);
  } else if (platform === "win32") {
    await run("cmd", ["/d", "/s", "/c", "start", "", url]);
  } else {
    await run("xdg-open", [url]);
  }
}
