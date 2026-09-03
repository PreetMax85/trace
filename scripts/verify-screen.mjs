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
const EXPECTED_QUESTIONS = 6;

/**
 * The answers the Explain panel has recorded, if any (PRD §15.5).
 *
 * Read here so the checks below can assert the RIGHT thing for the state the
 * repo is actually in, rather than skipping when the file is empty. An empty
 * file is the honest state before `npm run explain` has been run, and the panel
 * must then say so; a full one must render citations that open their row. Both
 * are asserted, and the script prints which branch it took so a green run is
 * never mistaken for coverage it did not have.
 */
function recordedAnswers() {
  return JSON.parse(readFileSync("data/synthetic/explanations.json", "utf8"));
}

/**
 * The actions the Act layer has drafted, if any (PRD §9, agent 3).
 *
 * Read for the same reason `recordedAnswers` is: an empty file is the honest
 * state before `npm run act` has been run, and the cards must then say so
 * rather than render blank. Both branches are asserted and the script prints
 * which one it took, so a green run is never mistaken for coverage it did not
 * have.
 */
/**
 * The build id of the tree as it stands, or null when nothing has been built.
 *
 * Read fresh rather than captured at import: the point is to compare what is on
 * disk now against what the server is answering with.
 */
function buildId() {
  try {
    return readFileSync(".next/BUILD_ID", "utf8").trim() || null;
  } catch {
    return null;
  }
}

function recordedDrafts() {
  return JSON.parse(readFileSync("data/synthetic/drafts.json", "utf8"));
}

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

  const evaluate = async (expression, awaitPromise = false) => {
    const response = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise,
    });
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

  // The server has to be serving THIS build. `next start` refuses the port when
  // an older server is still holding it, and that older server keeps answering
  // — so every assertion below would grade a build that predates the change
  // being verified. A stale run reporting OK is worse than no run at all, so
  // the build id on disk has to appear in the page the browser actually loaded.
  const builtId = buildId();
  if (builtId !== null) {
    const servedBuild = await evaluate(
      `document.documentElement.outerHTML.includes(${JSON.stringify(builtId)})`,
    );
    if (servedBuild !== true) {
      failures.push(
        `the server is not serving this build (${builtId}) — stop the one already on the port and start it again`,
      );
    }
  }

  const rows = await evaluate(`document.querySelectorAll('[role="row"]').length`);
  if (rows !== EXPECTED_ROWS) failures.push(`expected ${EXPECTED_ROWS} rows, found ${rows}`);

  // Scoped to the TABLE, not the document. The Explain panel renders record ids
  // too, as citation links, so a document-wide count stops being a count of
  // rows the moment an answer is recorded.
  const ids = await evaluate(`(() => {
    const text = [...document.querySelectorAll('[role="row"]')].map((r) => r.innerText).join(" ");
    return new Set([...text.matchAll(/pay_[A-Za-z0-9]{14}/g)].map((m) => m[0])).size;
  })()`);
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
      // Searched INSIDE the table rows. A document-wide search finds the
      // Explain panel's citation link for the same record first, which has no
      // row to click and reports as "no clickable text" — a failure that looks
      // like the row bug this script exists to catch. BUILD-LOG entry 30.
      const anchor = [...document.querySelectorAll('[role="row"] *')].find(
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

    // PRD §15.1. Only a flagged row is investigated, so only a flagged row gets
    // this section — an empty one on a matched row would imply a run that is
    // missing rather than a row no model was ever asked about. Asserted in a
    // real browser because this whole file exists for the reason BUILD-LOG 28
    // records: this screen has already shipped a section that typechecked,
    // rendered in tests, and did nothing on the page.
    const hasAgentSection = panel.includes("What the agent did");
    if (hasAgentSection !== expectFlagged) {
      failures.push(
        expectFlagged
          ? `${verdict}: flagged row ${id} shows no "What the agent did" section`
          : `${verdict}: matched row ${id} should have no "What the agent did" section`,
      );
      continue;
    }

    // PRD §9, agent 3. Only a flagged row has a next action; offering one on a
    // clean row would invite a person to act where nothing is wrong. Scoped
    // INSIDE the detail panel, never to the document: the cards are the third
    // place on this page that renders a record id, and a page-wide search is
    // exactly the mistake BUILD-LOG entry 30 records twice.
    const hasActions = await evaluate(
      `Boolean(document.querySelector('[data-testid="detail-panel"] [data-testid="action-cards"]'))`,
    );
    if (hasActions !== expectFlagged) {
      failures.push(
        expectFlagged
          ? `${verdict}: flagged row ${id} offers no drafted action`
          : `${verdict}: matched row ${id} should offer no drafted action`,
      );
      continue;
    }

    console.log(
      `  ${verdict.padEnd(16)} ${COLUMNS[column].padEnd(12)} ${id}  ->  ${panel.split("\n")[1] ?? ""}`,
    );
  }

  // PRD §15.5 — the Explain panel.
  const panelText = await evaluate(
    `document.querySelector('[data-testid="explain-panel"]')?.innerText ?? ""`,
  );
  if (panelText === "") {
    failures.push("the Explain panel did not render");
  }

  // Scoped to the question chips, NOT to the panel: the panel also holds the
  // Ask button, so a panel-wide count stops being a count of questions the
  // moment anything else in it gains a button. Same mistake as the row search
  // below, found the same way. BUILD-LOG entry 30.
  const questionCount = await evaluate(
    `document.querySelectorAll('[data-testid="explain-questions"] button').length`,
  );
  if (questionCount !== EXPECTED_QUESTIONS) {
    failures.push(`expected ${EXPECTED_QUESTIONS} example questions, found ${questionCount}`);
  }

  // Every row carries the anchor a citation scrolls to. Asserted whether or not
  // any answer has been recorded, because this is the half that silently
  // breaks: a citation whose target id does not exist scrolls nowhere and looks
  // exactly like one that worked. BUILD-LOG entry 28 is the same class of bug.
  const anchors = await evaluate(
    `document.querySelectorAll('[id^="row-pay_"], [id^="row-rfnd_"]').length`,
  );
  if (anchors !== EXPECTED_ROWS) {
    failures.push(`expected ${EXPECTED_ROWS} row anchors for citations, found ${anchors}`);
  }

  // The live question box and the route behind it. Exercised WITHOUT spending:
  // an empty body is rejected by validation before the model is ever reached,
  // so this stays free and deterministic whether or not a key is configured.
  const box = await evaluate(`(() => {
    const panel = document.querySelector('[data-testid="explain-panel"]');
    const input = panel?.querySelector('input');
    const ask = [...(panel?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent.trim() === "Ask",
    );
    return { hasInput: Boolean(input), askDisabledWhenEmpty: Boolean(ask && ask.disabled) };
  })()`);

  if (!box?.hasInput) failures.push("the Explain panel has no question box");
  // Disabled on an empty question, so a stray click cannot bill a call for a
  // question nobody asked.
  if (box && !box.askDisabledWhenEmpty) {
    failures.push("the Ask button is enabled with an empty question");
  }

  const routeCheck = await evaluate(`(async () => {
    const response = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, error: payload.error ?? null };
  })()`, true);

  if (routeCheck?.status !== 400) {
    failures.push(`POST /api/explain with no question answered ${routeCheck?.status}, expected 400`);
  } else if (typeof routeCheck.error !== "string" || routeCheck.error.length === 0) {
    failures.push("POST /api/explain rejected the request without saying why");
  }

  const recorded = recordedAnswers();
  if (recorded.length === 0) {
    // Nothing recorded yet. The panel must SAY so rather than render blank —
    // an empty answer under a real question reads as "the agent had nothing to
    // say" instead of "no run has happened".
    if (!panelText.includes("No answer has been recorded")) {
      failures.push("with no recorded answers, the panel does not say so");
    }
    console.log(`\n  Explain panel: ${questionCount} questions, no answers recorded yet.`);
  } else {
    const cited = await evaluate(`(() => {
      const panel = document.querySelector('[data-testid="explain-panel"]');
      const link = [...(panel?.querySelectorAll("a, [role=link]") ?? [])].find((el) =>
        /^(pay|rfnd)_[A-Za-z0-9]+$/.test(el.textContent.trim()),
      );
      if (!link) return null;
      const id = link.textContent.trim();
      link.click();
      return id;
    })()`);

    if (!cited) {
      failures.push("a recorded answer rendered no citation link");
    } else {
      await sleep(600);
      const panel = await evaluate(
        `document.querySelector('[data-testid="detail-panel"]')?.innerText ?? ""`,
      );
      if (!panel.includes(cited)) {
        failures.push(`citing ${cited} did not open that record's detail panel`);
      } else {
        console.log(`\n  Explain panel: citation ${cited} opened its row.`);
      }
    }
  }

  // PRD §9, agent 3 — the human gate. The detail panel is left showing the
  // last flagged row the loop above opened, which is the one with cards.
  const drafts = recordedDrafts();

  const cards = await evaluate(`(() => {
    const host = document.querySelector('[data-testid="detail-panel"] [data-testid="action-cards"]');
    if (!host) return null;
    // Scoped to the cards, never to the panel: the panel also holds the
    // reasoning trace, so a panel-wide button count stops being a count of
    // Confirm buttons the moment anything else in it gains one. BUILD-LOG 30.
    const buttons = [...host.querySelectorAll('[data-testid^="confirm-"]')];
    return {
      text: host.innerText,
      kinds: [...host.querySelectorAll('[data-testid^="action-"]')]
        .map((el) => el.getAttribute("data-testid"))
        .filter((id) => id !== "action-cards"),
      confirmButtons: buttons.length,
      allDisabled: buttons.length > 0 && buttons.every((b) => b.disabled),
      hasGateWarning: Boolean(host.querySelector('[data-testid="draft-gate-warning"]')),
    };
  })()`);

  if (cards === null) {
    failures.push("the flagged row's detail panel shows no action cards");
  } else if (drafts.length === 0) {
    // Nothing drafted yet. The cards must SAY so rather than render three empty
    // shells, which would read as "there is nothing to do here".
    if (!cards.text.includes("No action has been drafted")) {
      failures.push("with no recorded drafts, the action cards do not say so");
    }
    if (cards.confirmButtons !== 0) {
      failures.push("a Confirm button is offered for a draft that does not exist");
    }
    console.log(`\n  Act layer: no drafts recorded yet, and the panel says so.`);
  } else {
    // Three kinds, one Confirm each. The count is the thing that silently goes
    // wrong: a kind dropped from the map renders two cards and nothing errors.
    if (cards.kinds.length !== 3) {
      failures.push(`expected 3 drafted actions, found ${cards.kinds.length}`);
    }
    if (cards.confirmButtons !== 3) {
      failures.push(`expected 3 Confirm buttons, found ${cards.confirmButtons}`);
    }
    // The gate has to be consequential: a draft it refused must not be
    // confirmable. Asserted as a biconditional so neither half can pass alone.
    if (cards.hasGateWarning !== cards.allDisabled) {
      failures.push(
        cards.hasGateWarning
          ? "a draft the figure gate refused still offers an enabled Confirm button"
          : "every Confirm button is disabled with no gate warning saying why",
      );
    }
    console.log(
      `\n  Act layer: ${cards.kinds.length} drafts, ${cards.confirmButtons} Confirm buttons` +
        `${cards.hasGateWarning ? ", gated and disabled" : ", confirmable"}.`,
    );
  }

  // The Confirm route, exercised WITHOUT writing anything: a body naming no
  // record is rejected by validation before the database is ever reached, so
  // this stays free and deterministic whether or not one is configured.
  const confirmRoute = await evaluate(`(async () => {
    const response = await fetch("/api/actions/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, error: payload.error ?? null };
  })()`, true);

  if (confirmRoute?.status !== 400) {
    failures.push(
      `POST /api/actions/confirm with no record answered ${confirmRoute?.status}, expected 400`,
    );
  } else if (typeof confirmRoute.error !== "string" || confirmRoute.error.length === 0) {
    failures.push("POST /api/actions/confirm rejected the request without saying why");
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
