/**
 * Browser verification for the exception review screen.
 *
 * Unit tests cannot see this screen's one interaction. A click handler passed
 * to a component is not the same thing as a click handler that runs: a row
 * click can be wired correctly, typecheck, and still do nothing, which is an
 * afternoon this project has already lost once. BUILD-LOG entry 28.
 *
 * So this drives a real browser over the Chrome DevTools Protocol, dispatches
 * real mouse events, and reads the rendered result back out of the DOM. No test
 * dependency is added, Node's built-in WebSocket speaks CDP directly.
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
/**
 * The split the tabs have to show, and the same locked figures `docs/HANDOFF.md`
 * carries. Written here rather than read from the page: a count taken from the
 * thing under test grades it against itself.
 */
const EXPECTED_EXCEPTIONS = 16;
const EXPECTED_MATCHED = 38;
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
  //, so every assertion below would grade a build that predates the change
  // being verified. A stale run reporting OK is worse than no run at all, so
  // the build id on disk has to appear in the page the browser actually loaded.
  const builtId = buildId();
  if (builtId !== null) {
    const servedBuild = await evaluate(
      `document.documentElement.outerHTML.includes(${JSON.stringify(builtId)})`,
    );
    if (servedBuild !== true) {
      failures.push(
        `the server is not serving this build (${builtId}). Stop the one already on the port and start it again`,
      );
    }
  }

  // The table opens on the flagged rows, because those are the ones that need a
  // decision. Asserted before anything switches tabs: a default that quietly
  // became "all" would bury the queue again and nothing else here would notice.
  const flaggedTab = await evaluate(`(() => {
    const tabs = ["flagged", "matched", "all"].map((name) =>
      document.querySelector(\`[data-testid="tab-\${name}"]\`)
    );
    if (tabs.some((tab) => tab === null)) return null;
    return {
      counts: tabs.map((tab) => tab.innerText.replace(/\\D+/g, "")),
      openRows: document.querySelectorAll("tbody tr").length,
    };
  })()`);

  if (flaggedTab === null) {
    failures.push("the record table has no flagged/matched/all tabs");
  } else {
    if (flaggedTab.counts.join(",") !== `${EXPECTED_EXCEPTIONS},${EXPECTED_MATCHED},${EXPECTED_ROWS}`) {
      failures.push(`the tabs count ${flaggedTab.counts.join("/")}, expected ${EXPECTED_EXCEPTIONS}/${EXPECTED_MATCHED}/${EXPECTED_ROWS}`);
    }
    if (flaggedTab.openRows !== EXPECTED_EXCEPTIONS) {
      failures.push(`the table opens on ${flaggedTab.openRows} rows, expected the ${EXPECTED_EXCEPTIONS} flagged ones`);
    }
  }

  // Everything below needs every record reachable, so switch to the tab that
  // holds them all. This doubles as the check that switching tabs works.
  await evaluate(`document.querySelector('[data-testid="tab-all"]')?.click()`);
  await sleep(400);

  const rows = await evaluate(`document.querySelectorAll("tbody tr").length`);
  if (rows !== EXPECTED_ROWS) failures.push(`expected ${EXPECTED_ROWS} rows, found ${rows}`);

  // Scoped to the TABLE, not the document. The Explain panel renders record ids
  // too, as citation links, so a document-wide count stops being a count of
  // rows the moment an answer is recorded.
  const ids = await evaluate(`(() => {
    const text = [...document.querySelectorAll("tbody tr")].map((r) => r.innerText).join(" ");
    return new Set([...text.matchAll(/pay_[A-Za-z0-9]{14}/g)].map((m) => m[0])).size;
  })()`);
  if (ids !== EXPECTED_ROWS) {
    failures.push(`expected ${EXPECTED_ROWS} distinct record ids, found ${ids}`);
  }

  // Column names in table order, used to rotate which cell gets clicked.
  const COLUMNS = ["payment", "amount", "fee", "tax", "rate matched", "category"];
  let columnIndex = 0;

  for (const [verdict, { id, expectFlagged }] of targets()) {
    // A different column per verdict, so the whole row is covered rather than
    // one cell six times: a regression that makes only the amount column
    // unclickable would otherwise pass.
    const column = columnIndex % COLUMNS.length;
    columnIndex += 1;
    // Aimed at the TEXT, not at the middle of the cell. The cell's centre is
    // usually empty space, so a click there lands on a div and passes the
    // library's tag allowlist whatever the text is wrapped in, which would
    // make this script green against the exact bug it exists to catch.
    const box = await evaluate(`(() => {
      // Searched INSIDE the table rows. A document-wide search finds the
      // Explain panel's citation link for the same record first, which has no
      // row to click and reports as "no clickable text", a failure that looks
      // like the row bug this script exists to catch. BUILD-LOG entry 30.
      const anchor = [...document.querySelectorAll("tbody tr *")].find(
        (el) => el.children.length === 0 && el.textContent.trim() === ${JSON.stringify(id)}
      );
      if (!anchor) return null;
      const row = anchor.closest("tr");
      if (!row) return null;
      const cell = row.querySelectorAll("td")[${column}];
      if (!cell) return null;
      // Brought into view before its position is read. A mouse event is
      // dispatched at viewport coordinates, so a row below the fold gets a
      // click at a y the browser resolves to whatever is actually there 
      // which reports as "the row did not open" and looks exactly like the
      // click bug this script exists to catch. It used to be masked by a
      // 3200px-tall viewport that happened to fit every row; adding anything
      // above the table pushed the last ones out and broke it. Scrolling is
      // the fix, because it does not depend on the page's height.
      cell.scrollIntoView({ block: "center", behavior: "instant" });
      // The deepest element that actually paints text, what a finger lands on.
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

    const opening = expectFlagged ? "Flagged. " : "Matched. ";
    if (!panel.includes(opening)) {
      failures.push(`${verdict}: detail for ${id} does not read as "${opening.trim()}"`);
      continue;
    }

    // PRD §15.1. Only a flagged row is investigated, so only a flagged row gets
    // this section, an empty one on a matched row would imply a run that is
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

  // PRD §15.5, the Explain panel.
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
    // Nothing recorded yet. The panel must SAY so rather than render blank 
    // an empty answer under a real question reads as "the agent had nothing to
    // say" instead of "no run has happened".
    if (!panelText.includes("No answer has been recorded")) {
      failures.push("with no recorded answers, the panel does not say so");
    }
    console.log(`\n  Explain panel: ${questionCount} questions, no answers recorded yet.`);
  } else {
    const cited = await evaluate(`(() => {
      const panel = document.querySelector('[data-testid="explain-panel"]');
      const link = [...(panel?.querySelectorAll("a, button, [role=link]") ?? [])].find((el) =>
        /^(pay|rfnd)_[A-Za-z0-9]+$/.test(el.textContent.trim()),
      );
      if (!link) return null;
      const id = link.textContent.trim();
      link.click();
      return id;
    })()`);

    if (!cited) {
      failures.push("a recorded answer rendered no citation a person can open");
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

  // PRD §9, agent 3, the human gate. The detail panel is left showing the
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

  // ---------------------------------------------------------------------------
  // The first-time-viewer checks.
  //
  // Everything above grades whether the numbers are right. None of it could
  // tell a correct screen from an unreadable one, which is exactly how this
  // shipped with the product's name nowhere on the page, the body scrolling
  // sideways on a phone, and a second of unstyled HTML on every load. These
  // assert the things whose absence is invisible to someone who already knows
  // what they are looking at.
  // ---------------------------------------------------------------------------

  // Every headline figure opens its own derivation.
  //
  // The four figures are the most consequential numbers on the page and were
  // the only ones a reader had to take on faith. Each is asserted by a term of
  // its OWN arithmetic rather than by "the panel changed": a control that opened
  // the wrong figure's derivation would still change the panel, and that is the
  // failure most likely to happen when one of these is edited.
  const FIGURES = [
    ["itcAtRisk", "less claimable"],
    ["itcClaimable", "Tax on rows matched to a published rate"],
    ["invoiceTax", "GSTN says the credit is"],
    ["matched", "Flagged for review"],
  ];

  for (const [figure, term] of FIGURES) {
    const box = await evaluate(`(() => {
      const el = document.querySelector('[data-testid="figure-${figure}"]');
      if (!el) return null;
      el.scrollIntoView({ block: "center", behavior: "instant" });
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);

    if (!box) {
      failures.push(`the ${figure} figure is not on the page`);
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
    if (!panel.includes(term)) {
      failures.push(`clicking the ${figure} figure did not show its derivation ("${term}")`);
    }
  }
  const figureFailures = failures.filter((line) => line.includes("figure")).length;
  if (figureFailures === 0) {
    console.log(`\n  Figures: all ${FIGURES.length} open their own arithmetic.`);
  }

  // A row opens from the keyboard, not only from a mouse.
  //
  // The whole row is one focus stop and one click target. It used to be every
  // cell, which advertised 324 interactive stops on which Enter did nothing:
  // worse than not offering, because a keyboard reader is told the row is
  // operable and finds out otherwise. Asserted in a real browser because a
  // handler that typechecks and never fires is exactly what BUILD-LOG 28 is.
  const KEYBOARD_TARGET = "pay_qcqeWqwISCOg2K";
  const focused = await evaluate(`(() => {
    const anchor = [...document.querySelectorAll("tbody tr *")].find(
      (el) => el.children.length === 0 && el.textContent.trim() === ${JSON.stringify(KEYBOARD_TARGET)}
    );
    if (!anchor) return "no row carries that record";
    const row = anchor.closest("tr");
    if (!row) return "that record is not inside a row";
    row.scrollIntoView({ block: "center", behavior: "instant" });
    row.focus();
    return document.activeElement === row ? "focused" : "the row refused focus";
  })()`);

  if (focused !== "focused") {
    failures.push(`keyboard: ${focused}`);
  } else {
    for (const type of ["keyDown", "char", "keyUp"]) {
      await send("Input.dispatchKeyEvent", {
        type,
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        text: "\r",
      });
    }
    await sleep(600);

    const panel = await evaluate(
      `document.querySelector('[data-testid="detail-panel"]')?.innerText ?? ""`,
    );
    if (!panel.includes(KEYBOARD_TARGET)) {
      failures.push(
        `keyboard: Enter on a focused row did not open ${KEYBOARD_TARGET}, so the focus ring on every row is a lie`,
      );
    } else {
      console.log(`  Keyboard: Enter on a focused row opened ${KEYBOARD_TARGET}.`);
    }
  }

  // The explanation follows the reader down the table.
  //
  // Asserted structurally rather than by scrolling and looking, and that is the
  // point. `position: sticky` is silently defeated by any ancestor that creates
  // a scroll container, and it was: the section wrapper carried
  // `overflow-hidden` to clip its header band to a rounded corner, so the panel
  // stuck to a box that never scrolls and left the screen forty rows down.
  //
  // Scrolling and measuring cannot catch it. With a record open the panel is
  // taller than the window, so it legitimately scrolls under its own weight and
  // a visibility check passes whether the bug is there or not. The structural
  // question has one answer: is there a scroll container between the panel and
  // the body?
  const sticky = await evaluate(`(() => {
    const panel = document.querySelector('[data-testid="detail-panel"]');
    if (!panel) return null;

    const blockers = [];
    for (let el = panel.parentElement; el && el !== document.body; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (style.overflow !== "visible" || style.overflowX !== "visible" || style.overflowY !== "visible") {
        const name = typeof el.className === "string" ? el.className.split(" ").slice(0, 3).join(".") : "";
        blockers.push(el.tagName.toLowerCase() + (name ? "." + name : ""));
      }
    }
    return { position: getComputedStyle(panel).position, blockers };
  })()`);

  if (sticky === null) {
    failures.push("there is no detail panel to measure");
  } else if (sticky.position !== "sticky") {
    failures.push(
      `the detail panel is ${sticky.position}, not sticky, so it leaves the screen as soon as the reader scrolls the table`,
    );
  } else if (sticky.blockers.length > 0) {
    failures.push(
      `the detail panel is sticky but ${sticky.blockers[0]} between it and the body is a scroll container, which silently defeats it`,
    );
  } else {
    console.log("  Detail panel: sticky, with nothing above it clipping the scroll.");
  }

  // Trace says what it is, on the page itself and not only in the browser tab.
  const chrome = await evaluate(`(() => {
    const header = document.querySelector('[data-testid="site-header"]');
    const orientation = document.querySelector('[data-testid="orientation"]');
    return {
      headerText: header?.innerText ?? "",
      orientationText: orientation?.innerText ?? "",
      hasFooter: Boolean(document.querySelector('[data-testid="site-footer"]')),
      hasTestDataNotice: Boolean(document.querySelector('[data-testid="test-data-notice"]')),
      layers: document.querySelector('[data-testid="layer-strip"]')?.children.length ?? 0,
    };
  })()`);

  if (!chrome?.headerText.includes("Trace")) {
    failures.push("the page does not carry the product name");
  }
  // The name alone is not orientation. A reader who has never seen this has to
  // be told what it reconciles, or the table below is a data dump.
  for (const word of ["GSTR-2B", "Razorpay", "input tax credit"]) {
    if (!chrome?.orientationText.includes(word)) {
      failures.push(`the page never says what it does: "${word}" appears nowhere in the orientation`);
    }
  }
  // Four layers, named. Three is the old README's mistake: it listed Detect,
  // Explain and Act and silently dropped Investigate.
  if (chrome?.layers !== 4) {
    failures.push(`expected 4 named layers, found ${chrome?.layers}`);
  }
  // Stated up front, not discovered. A visitor who works out on their own that
  // the figures are synthetic was misled until the moment they worked it out.
  if (!chrome?.hasTestDataNotice) failures.push("the page does not say it runs on test data");
  if (!chrome?.hasFooter) failures.push("the page has no footer");

  // The styles, and the colour scheme, have to be IN the server's HTML.
  //
  // Fetched raw rather than read off the DOM, because by the time the DOM exists
  // the client bundle has booted and anything missing from the document has been
  // put right. That is the whole class of bug: a page that arrives unstyled, or
  // in the wrong scheme, and corrects itself a moment later looks perfect to
  // anything that grades the settled page.
  //
  // The scheme half matters most for a returning reader. The class on <html> is
  // written by the server from a cookie, so it has to be in the first bytes; if
  // it were applied by the client instead, every dark-mode visit would open with
  // a flash of a white page.
  const ssr = await evaluate(`(async () => {
    const light = await (await fetch(location.href, { cache: "no-store" })).text();
    const stylesheet = /<link[^>]+rel="stylesheet"[^>]*>/.test(light);
    const href = light.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/)?.[1] ?? null;
    const css = href === null ? "" : await (await fetch(href, { cache: "no-store" })).text();
    return {
      stylesheet,
      hasGroundRule: css.includes("--background"),
      namesProduct: light.includes("Trace"),
      lightIsLight: !/<html[^>]*class="[^"]*\bdark\b/.test(light),
    };
  })()`, true);

  if (!ssr?.stylesheet || !ssr?.hasGroundRule) {
    failures.push(
      "the server HTML does not link a stylesheet that defines the page ground, so the page will paint unstyled until the client bundle boots",
    );
  }
  if (ssr?.lightIsLight !== true) {
    failures.push("the server rendered the dark class with no dark cookie set");
  }
  if (!ssr?.namesProduct) {
    failures.push("the server HTML never names the product, so a crawler or a link preview sees nothing");
  }

  // And the other half: with the preference set, the FIRST bytes must already
  // say dark. This is the assertion a client-side theme switch cannot pass, and
  // it is the one that would have caught the flash of a white page that a
  // returning dark-mode reader used to meet on every visit.
  //
  // The cookie is written, the document is refetched with it, and the cookie is
  // put back the way it was, so this leaves the page exactly as it found it for
  // whatever runs after.
  const darkSsr = await evaluate(`(async () => {
    const before = document.cookie.match(/trace-color-scheme=(\\w+)/)?.[1] ?? null;
    document.cookie = "trace-color-scheme=dark; path=/; max-age=60; SameSite=Lax";
    const html = await (await fetch(location.href, { cache: "no-store" })).text();
    document.cookie = before === null
      ? "trace-color-scheme=; path=/; max-age=0; SameSite=Lax"
      : \`trace-color-scheme=\${before}; path=/; max-age=60; SameSite=Lax\`;
    return /<html[^>]*class="[^"]*\\bdark\\b/.test(html);
  })()`, true);

  if (darkSsr !== true) {
    failures.push(
      "with a dark preference stored, the server still sent a light document, so a returning reader meets a flash of the wrong page",
    );
  } else {
    console.log("  Colour scheme: the server sends dark on the first byte when it is asked for.");
  }

  // The link preview must not point at whoever built the page.
  //
  // `metadataBase` is resolved at BUILD time from an environment variable that
  // exists only when Vercel's system variables are switched on for the project.
  // When it is missing the value is absent rather than wrong, so a production
  // build silently emitted `http://localhost:3000/opengraph-image`, a card
  // that resolves to the reader's own machine, which is exactly what the card
  // was added to prevent. Nothing in a build log would have said so.
  //
  // Only meaningful against a production build; a dev server is honestly on
  // localhost, so the check is skipped there rather than failed.
  const preview = await evaluate(`(async () => {
    const html = await (await fetch(location.href, { cache: "no-store" })).text();
    const image = html.match(/property="og:image" content="([^"]+)"/)?.[1] ?? null;
    return { image, isDev: Boolean(document.querySelector("nextjs-portal")) };
  })()`, true);

  if (preview?.image === null) {
    failures.push("the page declares no og:image, so a shared link has no preview");
  } else if (!preview.isDev && preview.image.includes("localhost")) {
    failures.push(`og:image points at ${preview.image}, a shared link would resolve to the reader's own machine`);
  }

  // A URL that does not exist gets our own page, not Next's bare default.
  //
  // Asserted on the copy this project wrote, NOT on whether the product name
  // appears. The name is the wrong field to test: Next renders its default
  // not-found INSIDE the root layout, so the header, and with it "Trace" 
  // is on the page either way, and the check would pass with no `not-found.tsx`
  // at all. Two paths that share an outcome have to be separated on the field
  // that differs, which is the copy itself.
  const missing = await evaluate(`(async () => {
    const response = await fetch("/no-such-page", { cache: "no-store" });
    const html = await response.text();
    return {
      status: response.status,
      ours: html.includes("There is nothing at this address"),
      nextDefault: html.includes("This page could not be found"),
    };
  })()`, true);

  if (missing?.status !== 404) {
    failures.push(`an unknown URL answered ${missing?.status}, expected 404`);
  } else if (!missing.ours || missing.nextDefault) {
    failures.push("an unknown URL still gets Next's default 404 rather than this project's");
  }

  // Nothing scrolls the page sideways on a phone.
  //
  // Last, because it resizes the viewport. A wide table is fine; a wide BODY is
  // not, and the two are indistinguishable until you measure the document
  // against the window. Measured at 390px, an iPhone's CSS width.
  //
  // `mobile: false` deliberately. With mobile emulation on, Chrome applies the
  // page's viewport meta and its own shrink-to-fit, and `window.innerWidth`
  // came back as 638 rather than the 390 that was asked for, so the assertion
  // would have been comparing the document against a width nobody chose. A
  // plain narrow window asks the same question with nothing in between.
  // 390 is an iPhone's CSS width. 320 is the width WCAG 1.4.10 (Reflow) is
  // written against and a real iPhone SE, and it is where things break that 390
  // is wide enough to hide: at 320 the tab list needed 322px and took the
  // document with it, which the 390 check could not see.
  for (const width of [390, 320]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(1000);

    const narrow = await evaluate(`({
      docWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    })`);

    if (narrow?.viewport !== width) {
      // A check that silently graded a different width than the one requested
      // would pass for the wrong reason, which is worse than not running.
      failures.push(`asked for a ${width}px viewport, measured ${narrow?.viewport}px`);
    } else if (narrow.docWidth > narrow.viewport + 1) {
      failures.push(
        `at ${narrow.viewport}px the document is ${narrow.docWidth}px wide, the whole page scrolls sideways`,
      );
    } else {
      console.log(`  Narrow viewport: ${narrow.viewport}px, document ${narrow.docWidth}px, no sideways scroll.`);
    }
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

console.log(
  `\nOK, ${EXPECTED_ROWS} rows, every verdict opens its own explanation, and the page says what it is.`,
);
