import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { after, before, test } from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");
let serverProcess;
let html;

before(async () => {
  const portReservation = createServer();
  await new Promise((resolveListening) => portReservation.listen(0, "127.0.0.1", resolveListening));
  const port = portReservation.address().port;
  await new Promise((resolveClose) => portReservation.close(resolveClose));

  serverProcess = spawn(
    process.execPath,
    [resolve(projectRoot, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: projectRoot, stdio: "ignore" },
  );

  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error("landing page server exited before responding");
    try {
      const response = await fetch(origin);
      if (response.ok) {
        html = await response.text();
        return;
      }
    } catch {
      // The server may not be listening yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("landing page server did not return HTTP 200 within 20 seconds");
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    const exited = once(serverProcess, "exit");
    serverProcess.kill("SIGTERM");
    await exited;
  }
});

test("public landing page describes adult declarations and the closed booking gate", () => {
  const statusSection = html.match(/<section\b[^>]*\bid="status"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(statusSection, "expected the public status section");
  assert.match(statusSection, /Adults can declare their eligibility/i);
  assert.match(statusSection, /requesting seats are waiting on launch approval/i);
});

test("public landing page description identifies route sharing as prelaunch", () => {
  const descriptionTag = html.match(/<meta\b[^>]*\bname="description"[^>]*>/)?.[0];
  assert.ok(descriptionTag, "expected the public description metadata");
  assert.match(descriptionTag, /driver-posted route sharing/i);
  assert.match(descriptionTag, /real ride bookings are not live/i);
});

test("landing skip link has a unique focusable content target", () => {
  assert.match(html, /href="#landing-content"[^>]*>Skip to main content/);
  assert.equal([...html.matchAll(/id="landing-content"/g)].length, 1);
  assert.equal([...html.matchAll(/id="main-content"/g)].length, 1);
});
