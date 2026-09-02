/**
 * Browser verification for the exception review screen.
 *
 * Unit tests cannot see this screen's one interaction. A click handler passed
 * to a component is not the same thing as a click handler that runs: Blade's
 * table sits on `@table-library/react-table-library`, which discards a click
 * whose target is not one of five tag names, so a row click can be wired
 * correctly, typecheck, and still do nothing. BUILD-LOG entry 28.
 *
 * So this drives a real browser over the Chrome DevTools Protocol, dispatches
 * real mouse events, and reads the rendered result back out of the DOM. No test
 * dependency is added — Node's built-in WebSocket speaks CDP directly.
 *
 *   npm run dev            # or npm run build && npx next start
 *   npm run verify:screen
 *
 * Override the target with TARGET_URL, and the browser with CHROME_PATH.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TARGET_URL = process.env.TARGET_URL ?? "http://localhost:3000/";
const PORT = Number(process.env.CDP_PORT ?? 9333);
const EXPECTED_ROWS = 54;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One record id per verdict, read from the fixture's own manifest. */
function targets() {
  const expected = JSON.parse(readFileSync("data/synthetic/expected.json", "utf8"));
  const picked = new Map();

  for (const record of expected.records) {
    const key = record.exception_category ?? `MATCHED_${record.match_method}`;
    if (!picked.has(key)) {
      picked.set(key, {
        id: record.entity_id,
        expectFlagged: record.status === "EXCEPTION",
      });
    }
  }

  return picked;
}

function chromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      `no Chrome found. Set CHROME_PATH to a Chrome or Chromium binary. Tried: ${candidates.join(", ")}`,
    );
  }

  return found;
}

const browser = spawn(
  chromeBinary(),
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "trace-verify-"))}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const failures = [];
let ws;

try {
  // Wait for the debugging endpoint rather than guessing at a sleep.
  let ready = false;
  for (let attempt = 0; attempt < 40 && !ready; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/json/version`);
      ready = true;
    } catch {
      await sleep(250);
    }
  }
  if (!ready) throw new Error("Chrome did not open its debugging port");

  const page = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
  ).json();

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let messageId = 0;
  const pending = new Map();
  const consoleErrors = [];

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push(
        message.params.exceptionDetails.exception?.description ?? "uncaught exception",
      );
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++messageId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true });
    return response.result?.result?.value;
  };

  await send("Runtime.enable");
  await send("Page.enable");
  // Tall enough that every row is in the viewport, so a click needs no scroll.
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1680,
    height: 3200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: TARGET_URL });
  await sleep(Number(process.env.WAIT_MS ?? 9000));

  const rows = await evaluate(`document.querySelectorAll('[role="row"]').length`);
  if (rows !== EXPECTED_ROWS) failures.push(`expected ${EXPECTED_ROWS} rows, found ${rows}`);

  const ids = await evaluate(
    `new Set([...document.body.innerText.matchAll(/pay_[A-Za-z0-9]{14}/g)].map((m) => m[0])).size`,
  );
  if (ids !== EXPECTED_ROWS) {
    failures.push(`expected ${EXPECTED_ROWS} distinct record ids, found ${ids}`);
  }

  // Column names in table order, used to rotate which cell gets clicked.
  const COLUMNS = ["settlement", "amount", "fee", "tax", "match method", "category"];
  let columnIndex = 0;

  for (const [verdict, { id, expectFlagged }] of targets()) {
    // A different column per verdict, so the whole row is covered rather than
    // one cell six times: a regression that makes only the amount column
    // unclickable would otherwise pass.
    const column = columnIndex % COLUMNS.length;
    columnIndex += 1;
    // Aimed at the TEXT, not at the middle of the cell. The cell's centre is
    // usually empty space, so a click there lands on a div and passes the
    // library's tag allowlist whatever the text is wrapped in — which would
    // make this script green against the exact bug it exists to catch.
    const box = await evaluate(`(() => {
      const anchor = [...document.querySelectorAll('*')].find(
        (el) => el.children.length === 0 && el.textContent.trim() === ${JSON.stringify(id)}
      );
      if (!anchor) return null;
      const row = anchor.closest('[role="row"]');
      if (!row) return null;
      const cell = row.querySelectorAll('td,[role="cell"],[role="gridcell"]')[${column}];
      if (!cell) return null;
      // The deepest element that actually paints text — what a finger lands on.
      const leaf = [...cell.querySelectorAll('*')]
        .filter((el) => el.children.length === 0 && el.textContent.trim().length > 0)
        .pop() ?? cell;
      const rect = leaf.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);

    if (!box) {
      failures.push(`${verdict}: no clickable text in the ${COLUMNS[column]} cell of row ${id}`);
      continue;
    }

    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", {
        type,
        x: Math.round(box.x),
        y: Math.round(box.y),
        button: "left",
        clickCount: 1,
      });
    }
    await sleep(500);

    const panel = await evaluate(
      `document.querySelector('[data-testid="detail-panel"]')?.innerText ?? ""`,
    );

    if (!panel.includes(id)) {
      failures.push(
        `${verdict}: clicking the ${COLUMNS[column]} cell of ${id} did not open its detail panel`,
      );
      continue;
    }

    const opening = expectFlagged ? "Flagged — " : "Matched — ";
    if (!panel.includes(opening)) {
      failures.push(`${verdict}: detail for ${id} does not read as "${opening.trim()}"`);
      continue;
    }

    console.log(
      `  ${verdict.padEnd(16)} ${COLUMNS[column].padEnd(12)} ${id}  ->  ${panel.split("\n")[1] ?? ""}`,
    );
  }

  for (const error of consoleErrors) failures.push(`console: ${error}`);
} finally {
  ws?.close();
  browser.kill();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\nOK — ${EXPECTED_ROWS} rows, every verdict opens its own explanation.`);
