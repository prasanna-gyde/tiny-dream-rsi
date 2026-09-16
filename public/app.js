import { world, TOP_LEVEL } from '../src/world.js';
import { explore, freshHistory } from '../src/explorer.js';
import { dream } from '../src/dream.js';
import { POLICIES, deepPolicy } from '../src/policies.js';

const ROOT_ID = 'ROOT';
const BUDGET = 5;
const STEP_DELAY_MS = 550;
const DREAM_STEP_DELAY_MS = 350;
const PAUSE_MS = 900;

// ---------- layout (computed once from the fixed hidden world) ----------
function layoutTree() {
  const positions = {};
  let nextLeafX = 0;
  function walk(id, depth) {
    const children = id === ROOT_ID ? TOP_LEVEL : (world[id]?.children || []);
    if (children.length === 0) {
      const x = nextLeafX++;
      positions[id] = { x, depth };
      return x;
    }
    const xs = children.map((c) => walk(c, depth + 1));
    const x = (xs[0] + xs[xs.length - 1]) / 2;
    positions[id] = { x, depth };
    return x;
  }
  walk(ROOT_ID, 0);
  return positions;
}
const POS = layoutTree();
const ALL_IDS = Object.keys(world);
const SPACING_X = 68;
const SPACING_Y = 78;
const OFFSET_X = 40;
const OFFSET_Y = 30;

function coord(id) {
  const p = POS[id];
  return { cx: OFFSET_X + p.x * SPACING_X, cy: OFFSET_Y + p.depth * SPACING_Y };
}

// ---------- app state ----------
const app = {
  phase: 'r1-intro',
  baseHistory: freshHistory(),
  round1: null,
  round2: null,
  dreamResults: [],
  chosenPolicy: null,
  overlay: null, // { mode: 'real'|'dream', history, creditedSet, currentNodeId }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pushLog(label, text) {
  const el = document.getElementById('event-log');
  const line = document.createElement('div');
  line.className = `log-line log-${label.toLowerCase()}`;
  line.innerHTML = `<span class="log-label">${label}</span>${text}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  document.getElementById('activity-summary').textContent = `${label} · ${text.replace(/&rarr;/g, '→')}`;
}

// ---------- rendering ----------
function renderTree() {
  const svg = document.getElementById('tree-svg');
  const parts = [];

  for (const id of [ROOT_ID, ...ALL_IDS]) {
    const children = id === ROOT_ID ? TOP_LEVEL : world[id].children;
    const a = coord(id);
    for (const childId of children) {
      const b = coord(childId);
      const cls = edgeClass(childId);
      const midY = (a.cy + b.cy) / 2;
      parts.push(`<path d="M ${a.cx} ${a.cy + 14} C ${a.cx} ${midY}, ${b.cx} ${midY}, ${b.cx} ${b.cy - 18}" class="tree-edge ${cls}" />`);
    }
  }

  for (const id of [ROOT_ID, ...ALL_IDS]) {
    const { cx, cy } = coord(id);
    if (id === ROOT_ID) {
      parts.push(`<rect x="${cx - 30}" y="${cy - 14}" width="60" height="28" rx="14" class="node-root" />`);
      parts.push(`<text x="${cx}" y="${cy + 4}" class="root-label">START</text>`);
      continue;
    }
    const info = nodeInfo(id);
    let cls = info.known ? 'node-discovered' : 'node-unknown';
    if (info.isCurrent) cls += ' node-current';
    parts.push(`<circle cx="${cx}" cy="${cy}" r="17" class="node ${cls}" />`);
    if (info.known) {
      parts.push(`<text x="${cx}" y="${cy + 4}" class="score">${info.score}</text>`);
    } else {
      parts.push(`<text x="${cx}" y="${cy + 4}" class="unknown-mark">?</text>`);
    }
    if (info.known) parts.push(`<text x="${cx}" y="${cy + 30}" class="label">${id}</text>`);
  }

  svg.innerHTML = parts.join('');
}

function nodeInfo(id) {
  const overlayNode = app.overlay?.history?.nodes?.[id];
  const baseNode = app.baseHistory.nodes[id];
  const source = overlayNode || baseNode;
  const isCurrent = app.overlay?.currentNodeId === id;
  return { known: !!source, score: source?.score, isCurrent };
}

function edgeClass(childId) {
  const known = !!(app.baseHistory.nodes[childId] || app.overlay?.history?.nodes?.[childId]);
  if (app.overlay?.creditedSet?.has(childId)) {
    return app.overlay.mode === 'real' ? 'edge-real' : 'edge-dream';
  }
  return known ? 'edge-known' : 'edge-unknown';
}

function renderRoundInfo(html) {
  document.getElementById('round-info').innerHTML = html;
}
function renderControls(html) {
  document.getElementById('controls').innerHTML = html;
}
function renderDreamTable(html) {
  document.getElementById('dream-table').innerHTML = html;
}

function phaseStep() {
  if (app.phase.startsWith('dream')) return 2;
  if (app.phase.startsWith('r2')) return 3;
  if (app.phase === 'final') return 4;
  return 1;
}

function displayedBest() {
  if (app.phase === 'dream-done' && app.dreamResults.length) {
    return Math.max(...app.dreamResults.map((result) => result.bestScore));
  }
  const history = app.overlay?.history || app.baseHistory;
  let ids;
  if (app.phase.startsWith('dream')) {
    ids = [...(app.overlay?.creditedSet || [])];
  } else {
    ids = Object.keys(history.nodes).filter((id) => history.nodes[id].expanded);
  }
  const scores = ids.map((id) => history.nodes[id]?.score).filter(Number.isFinite);
  return scores.length ? Math.max(...scores) : null;
}

function searchesLeft() {
  if (app.phase === 'r1-intro' || app.phase === 'r2-intro') return BUDGET;
  if (app.phase === 'r1-running' || app.phase === 'r2-running' || app.phase === 'dream-running') {
    return Math.max(0, BUDGET - (app.overlay?.creditedSet?.size || 0));
  }
  return 0;
}

function renderChrome() {
  const step = phaseStep();
  document.querySelectorAll('.phase-step').forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle('is-current', n === step);
    el.classList.toggle('is-complete', n < step || step === 4);
  });

  const mode = document.getElementById('mode-badge');
  if (app.phase === 'final') {
    mode.className = 'mode-badge mode-complete';
    mode.innerHTML = '<i></i> Loop complete';
  } else if (app.phase.startsWith('dream')) {
    mode.className = 'mode-badge mode-dream';
    mode.innerHTML = '<i></i> Dream replay';
  } else {
    mode.className = 'mode-badge mode-real';
    mode.innerHTML = '<i></i> Reality';
  }

  const history = app.overlay?.history || app.baseHistory;
  document.getElementById('metric-best').textContent = displayedBest() ?? '—';
  document.getElementById('metric-budget').textContent = searchesLeft();
  document.getElementById('metric-known').textContent = Object.keys(history.nodes).length;

  const caption = document.getElementById('tree-caption');
  if (app.phase.startsWith('dream')) {
    caption.textContent = 'Replaying saved history. Violet paths cost no new real-world searches.';
  } else if (app.phase.startsWith('r2')) {
    caption.textContent = 'The improved policy is back in reality, revealing genuinely new nodes.';
  } else if (app.phase === 'final') {
    caption.textContent = 'History made the strategy better. Better strategy created richer history.';
  } else {
    caption.textContent = 'Scores are visible. What lies beneath each branch is still hidden.';
  }
}

function renderAll() {
  renderTree();
  renderChrome();
}

// ---------- Round 1 ----------
function showRound1Intro() {
  app.phase = 'r1-intro';
  renderRoundInfo(`
    <p class="stage-label">Step 1 · Explore reality</p>
    <h3>Start with a<br />naive strategy.</h3>
    <p>We have <strong>${BUDGET} searches</strong>. The model can see four starting scores, but nothing underneath them.</p>
    <div class="policy-line"><span>Current strategy</span><span class="pill pill-real">Deep</span></div>
    <div class="explain-box">
      <strong>How “Deep” behaves</strong>
      It takes the first branch it sees and keeps going. It never looks back.
    </div>
  `);
  renderControls(`<button id="run-real">Run the first search <span aria-hidden="true">→</span></button><p class="button-note">Watch five real searches happen one by one.</p>`);
  document.getElementById('run-real').addEventListener('click', runRound1);
  renderDreamTable('');
  renderAll();

  const startingBranches = TOP_LEVEL.map((id) => `${id}=${world[id].score}`).join(', ');
  pushLog('SYSTEM', `Starting branches visible: ${startingBranches}. Nothing else is known yet.`);
}

async function runRound1() {
  app.phase = 'r1-running';
  renderControls(`<button disabled>Exploring reality…</button><p class="button-note">New branches can appear here.</p>`);
  pushLog('SYSTEM', 'Round 1 begins. Policy: Deep.');

  app.overlay = { mode: 'real', history: app.baseHistory, creditedSet: new Set(), currentNodeId: null };
  renderAll();

  const result = explore(deepPolicy(), BUDGET, null, ({ nodeId, newlyRevealed }) => {
    app.overlay.currentNodeId = nodeId;
    app.overlay.creditedSet.add(nodeId);
  });

  // Replay the steps with animation delays, driven by the credited order.
  await animateReal(result, app.baseHistory);

  app.baseHistory = result.history;
  app.round1 = result;
  app.overlay = { mode: 'real', history: app.baseHistory, creditedSet: new Set(result.credited), currentNodeId: null };
  renderAll();

  renderRoundInfo(`
    <p class="stage-label">Reality complete</p>
    <h3>Five searches created a history.</h3>
    <p>The naive strategy reached <strong>${result.bestScore}</strong>. More importantly, every choice and outcome is now saved.</p>
    <div class="explain-box good">
      <strong>We now have a replayable map</strong>
      The system can test other strategies against what it already discovered.
    </div>
  `);
  renderControls(`<button id="start-dream" class="dream-btn">Use history to dream <span aria-hidden="true">→</span></button><p class="button-note">No model calls. No new solutions.</p>`);
  document.getElementById('start-dream').addEventListener('click', showDreamIntro);
}

// Re-run the credited path node by node purely for the animation/log, against
// a scratch copy, so the tree fills in with a visible delay.
async function animateReal(result, historyBefore) {
  let shown = JSON.parse(JSON.stringify(historyBefore));
  const creditedSet = new Set();
  for (const nodeId of result.credited) {
    await sleep(STEP_DELAY_MS);
    const finalNode = result.history.nodes[nodeId];
    shown.nodes[nodeId] = { ...finalNode };
    for (const childId of finalNode.children || []) {
      if (!shown.nodes[childId]) shown.nodes[childId] = { ...result.history.nodes[childId] };
    }
    creditedSet.add(nodeId);
    app.overlay = { mode: 'real', history: shown, creditedSet, currentNodeId: nodeId };
    renderAll();
    pushLog('REALITY', `Opened ${nodeId} (score ${finalNode.score})`);
    for (const childId of finalNode.children || []) {
      pushLog('REALITY', `Discovered ${childId} &rarr; score ${result.history.nodes[childId].score}`);
    }
  }
}

// ---------- Dream ----------
function showDreamIntro() {
  app.phase = 'dream-intro';
  app.overlay = { mode: 'real', history: app.baseHistory, creditedSet: new Set(app.round1.credited), currentNodeId: null };
  renderAll();
  renderRoundInfo(`
    <p class="stage-label dream">Step 2 · Dream on history</p>
    <h3>Try three strategies for free.</h3>
    <p>Each strategy will navigate the <strong>same saved history</strong> as if it had been in control.</p>
    <div class="explain-box dream">
      <strong>Watch the visual difference</strong>
      Violet paths move through existing nodes. No new node can appear during a dream.
    </div>
  `);
  renderControls(`<button id="start-dreaming" class="dream-btn">Replay all three strategies <span aria-hidden="true">→</span></button><p class="button-note">Same history. Same five-search budget.</p>`);
  document.getElementById('start-dreaming').addEventListener('click', runDreamSequence);
}

async function runDreamSequence() {
  app.phase = 'dream-running';
  renderControls(`<button disabled class="dream-btn">Replaying history…</button><p class="button-note">Nothing new is being generated.</p>`);
  app.dreamResults = [];
  renderDreamTable(dreamTableHTML());
  renderAll();

  for (const policy of POLICIES) {
    pushLog('DREAM', `Testing "${policy.name}"`);
    await sleep(PAUSE_MS / 2);

    const creditedSet = new Set();
    let shown = { nodes: {} };
    for (const id of TOP_LEVEL) shown.nodes[id] = { ...app.baseHistory.nodes[id] };

    const result = dream(app.baseHistory, policy.factory(BUDGET), BUDGET, ({ nodeId }) => {
      // consumed via replay below for animation timing
    });

    for (const nodeId of result.credited) {
      await sleep(DREAM_STEP_DELAY_MS);
      const finalNode = result.history.nodes[nodeId];
      shown.nodes[nodeId] = { ...finalNode };
      for (const childId of finalNode.children || []) {
        if (!shown.nodes[childId]) shown.nodes[childId] = { ...result.history.nodes[childId] };
      }
      creditedSet.add(nodeId);
      app.overlay = { mode: 'dream', history: shown, creditedSet, currentNodeId: nodeId };
      renderAll();
    }

    pushLog('DREAM', `Best score: ${result.bestScore}`);
    app.dreamResults.push({ policy, bestScore: result.bestScore, credited: result.credited });
    renderDreamTable(dreamTableHTML());
    await sleep(PAUSE_MS);
  }

  finishDreaming();
}

function dreamTableHTML() {
  if (app.dreamResults.length === 0) {
    return `<h4>Replay results</h4><div class="result-row"><span><i></i>Waiting for the first replay…</span><strong>—</strong></div>`;
  }
  const maxScore = Math.max(...app.dreamResults.map((r) => r.bestScore));
  const rows = app.dreamResults.map((r) => {
    const isWinner = r.bestScore === maxScore;
    return `<div class="result-row ${isWinner ? 'winner' : ''}"><span><i></i>${r.policy.name} <small class="result-meta">${r.credited.length} searches</small></span><strong>${r.bestScore}</strong></div>`;
  }).join('');
  return `
    <h4>Replay results · best reached</h4>
    <div class="result-list">${rows}</div>
  `;
}

function finishDreaming() {
  app.phase = 'dream-done';
  const maxScore = Math.max(...app.dreamResults.map((r) => r.bestScore));
  const winners = app.dreamResults.filter((r) => r.bestScore === maxScore);
  const winner = winners[winners.length - 1]; // prefer the more general policy on a tie
  app.chosenPolicy = winner.policy;

  pushLog('SYSTEM', `New exploration policy: ${winner.policy.name}`);

  const neverOpenedTop = TOP_LEVEL.filter((id) => app.baseHistory.nodes[id] && !app.baseHistory.nodes[id].expanded);

  app.overlay = { mode: 'dream', history: app.baseHistory, creditedSet: new Set(), currentNodeId: null };
  renderAll();

  renderRoundInfo(`
    <p class="stage-label dream">Dream complete</p>
    <h3>History revealed a better strategy.</h3>
    <p><strong>${winner.policy.name}</strong> reached <strong>${maxScore}</strong> by navigating the old history differently.</p>
    <div class="explain-box dream">
      <strong>Nothing new was generated</strong>
      We changed only the strategy used to navigate existing history.
    </div>
    ${neverOpenedTop.length ? `<div class="explain-box"><strong>The honest limitation</strong> ${neverOpenedTop.length === 1 ? 'Branch' : 'Branches'} ${neverOpenedTop.join(', ')} ${neverOpenedTop.length === 1 ? 'was' : 'were'} never opened in reality. Dreaming cannot know what is hiding beneath ${neverOpenedTop.length === 1 ? 'it' : 'them'}.</div>` : ''}
  `);
  renderControls(`<button id="explore-again">Take the better strategy to reality <span aria-hidden="true">→</span></button>`);
  document.getElementById('explore-again').addEventListener('click', showRound2Intro);
}

// ---------- Round 2 ----------
function showRound2Intro() {
  app.phase = 'r2-intro';
  renderRoundInfo(`
    <p class="stage-label">Step 3 · Explore again</p>
    <h3>Same model.<br />Smarter search.</h3>
    <p>We return to reality with <strong>${BUDGET} new searches</strong> and the strategy chosen in the dream.</p>
    <div class="policy-line"><span class="pill pill-real">Deep</span><span aria-hidden="true">→</span><span class="pill pill-dream">${app.chosenPolicy.name}</span></div>
    <div class="explain-box">
      <strong>What changes now?</strong>
      The new strategy explores broadly before committing to the best-looking branch.
    </div>
  `);
  renderControls(`<button id="explore-again-2">Run the improved search <span aria-hidden="true">→</span></button><p class="button-note">This is reality again, so new nodes can appear.</p>`);
  document.getElementById('explore-again-2').addEventListener('click', runRound2);
  renderAll();
}

async function runRound2() {
  app.phase = 'r2-running';
  renderControls(`<button disabled>Exploring with the new strategy…</button><p class="button-note">New real-world outcomes are being added to history.</p>`);
  pushLog('SYSTEM', `Round 2 begins. Policy: ${app.chosenPolicy.name}.`);

  const historyBefore = app.baseHistory;
  const result = explore(app.chosenPolicy.factory(BUDGET), BUDGET, historyBefore);
  app.overlay = { mode: 'real', history: historyBefore, creditedSet: new Set(), currentNodeId: null };
  renderAll();

  await animateReal(result, historyBefore);

  app.baseHistory = result.history;
  app.round2 = result;
  const cumulativeBest = Math.max(app.round1.bestScore, result.bestScore);
  app.overlay = { mode: 'real', history: app.baseHistory, creditedSet: new Set(result.credited), currentNodeId: null };
  renderAll();

  renderRoundInfo(`
    <p class="stage-label">Reality complete</p>
    <h3>The better strategy found an 80.</h3>
    <p>Round 1 stopped at <strong>${app.round1.bestScore}</strong>. With the same model and the same budget, Round 2 reached <strong>${cumulativeBest}</strong>.</p>
    <div class="explain-box good">
      <strong>The strategy improved, not the model</strong>
      Dreaming changed where the next five real searches were spent.
    </div>
  `);
  renderControls(`<button id="see-final">See the whole loop <span aria-hidden="true">→</span></button>`);
  document.getElementById('see-final').addEventListener('click', showFinal);
}

// ---------- Final ----------
function showFinal() {
  app.phase = 'final';
  const stillHiddenTop = TOP_LEVEL.filter((id) => app.baseHistory.nodes[id] && !app.baseHistory.nodes[id].expanded);
  renderDreamTable('');

  renderRoundInfo(`
    <p class="stage-label">The recursive loop</p>
    <h3>That’s Dream-RSI.</h3>
    <div class="final-loop" aria-label="Reality creates history, history improves the policy, and the policy returns to reality">
      <span class="loop-step">Reality</span><span class="loop-step">History</span><span class="loop-step">Better policy</span>
      <span class="loop-step">More reality</span><span class="loop-step">More history</span><span class="loop-step">Improve again</span>
    </div>
    <p>The system improves <strong>how it searches</strong> without changing the underlying model.</p>
    ${stillHiddenTop.length ? `<div class="explain-box"><strong>The limitation remains</strong> Branch ${stillHiddenTop.join(', ')} was never opened. Its hidden score stays unknowable until a future real search looks there.</div>` : ''}
  `);
  renderControls(`<button id="restart">Run it again <span aria-hidden="true">↻</span></button>`);
  document.getElementById('restart').addEventListener('click', () => window.location.reload());
  renderAll();
}

// ---------- boot ----------
showRound1Intro();
