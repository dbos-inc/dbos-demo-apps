/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import axios, { AxiosError } from "axios";
import { spawn, execSync, ChildProcess } from "child_process";
import { Writable } from "stream";

async function waitForMessageTest(command: ChildProcess, port: string) {
  const stdout = command.stdout as unknown as Writable;
  const stdin = command.stdin as unknown as Writable;
  const stderr = command.stderr as unknown as Writable;

  const waitForMessage = new Promise<void>((resolve, reject) => {
    const onData = (data: Buffer) => {
      const message = data.toString();
      process.stdout.write(message);
      if (message.includes("Server is running at")) {
        stdout.off("data", onData); // remove listener
        resolve();
      }
    };

    stdout.on("data", onData);

    command.on("error", (error) => {
      reject(error); // Reject promise on command error
    });
  });
  try {
    await waitForMessage;
    const response = await axios.get(`http://127.0.0.1:${port}/api/greeting/`).catch((reason) => { return (reason as AxiosError).response!.status; });
    expect(response).toBe(401);  // Should return with 401: protected resources.
  } finally {
    stdin.end();
    stdout.destroy();
    stderr.destroy();
    command.kill();
  }
}

describe("runtime-tests", () => {
  beforeAll(() => {
    execSync('npm install');
    execSync('npm run build');
  });

  test("basic-greeting", async () => {
    const command = spawn('node_modules/@dbos-inc/operon/dist/src/operon-runtime/cli.js', ['start'], {
      env: process.env
    });
    await waitForMessageTest(command, '8081');
  });
});