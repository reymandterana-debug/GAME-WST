/* ============================================================
   ROCK - PAPER - SCISSORS (1v1, same device)
   Flow: setup -> pick (A) -> pick (B) -> countdown -> reveal -> ... -> over
   ============================================================ */

/* ---------- DATA STRUCTURES ---------- */
const choices = ["rock", "paper", "scissors"];                          // ARRAY
const rules = { rock: "scissors", paper: "rock", scissors: "paper" };    // OBJECT: key beats value
const hands = { rock: "✊", paper: "✋", scissors: "✌️" };               // pictures for each choice
const keyMap = { r: "rock", p: "paper", s: "scissors" };                 // keyboard shortcuts
const WIN_TARGET = 3;                                                    // first to 3 round wins

/* ---------- CLASS (OOP) ---------- */
class Player {
  constructor(name) {
    this.name = name;
    this.score = 0;
  }
  addWin() {
    this.score++;
  }
}

/* ---------- STATE ---------- */
let playerA = null, playerB = null;
let history = [];            // every finished round
let phase = "setup";         // setup | pick | countdown | reveal | over | leaderboard
let turn = "A";              // whose pick it is during the "pick" phase
let pendingChoiceA = null;   // A's secret choice while B is picking
let lastRound = null;
let busy = false;            // blocks double-clicks while an effect is playing
let soundOn = true;
let saveStatus = "";         // message about saving the result (shown on the final screen)

/* ---------- DATABASE (Supabase) ----------
   The keys come from config.js. If they are not filled in, the game still
   works -- it just can't save results. */
let db = null;
if (window.supabase && typeof SUPABASE_URL !== "undefined" && SUPABASE_URL && !SUPABASE_URL.startsWith("YOUR_")) {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function setSaveStatus(text) {
  saveStatus = text;
  const el = document.getElementById("saveStatus");
  if (el) el.textContent = text;
}

// CREATE: save the finished match as one row in the "matches" table
async function saveMatch() {
  const champ = playerA.score >= WIN_TARGET ? playerA : playerB;
  const rounds = history.slice().reverse().map(function (r) {      // oldest round first
    return { a: r.a, b: r.b, result: r.result };
  });
  const res = await db.from("matches").insert({
    player1: playerA.name, player2: playerB.name,
    score1: playerA.score, score2: playerB.score,
    winner: champ.name, rounds: rounds
  });
  setSaveStatus(res.error ? "Could not save: " + res.error.message : "✅ Result saved to the database.");
}

// READ: load recent matches and draw the leaderboard + history
async function showLeaderboard() {
  phase = "leaderboard";
  render();
  const box = document.getElementById("lbBody");
  if (!db) { box.innerHTML = "Database not connected. Fill in config.js first."; return; }
  const res = await db.from("matches").select("*").order("created_at", { ascending: false }).limit(30);
  if (res.error) { box.innerHTML = "Could not load: " + escapeHtml(res.error.message); return; }
  box.className = "";
  box.innerHTML = buildRanking(res.data) + buildMatchList(res.data);
}

// DELETE: remove one match, then reload the list
async function deleteMatch(id) {
  if (!confirm("Delete this match from the database?")) return;
  await db.from("matches").delete().eq("id", id);
  showLeaderboard();
}

function backFromBoard() {
  phase = (playerA && matchIsOver()) ? "over" : "setup";
  render();
}

// count wins per player with reduce(), then sort best first
function buildRanking(matches) {
  if (matches.length === 0) return "<div class='hint'>No matches saved yet. Play one!</div>";
  const wins = matches.reduce(function (total, m) {                // HIGHER-ORDER FUNCTION (reduce)
    total[m.winner] = (total[m.winner] || 0) + 1;
    return total;
  }, {});
  const ranking = Object.keys(wins)
    .map(function (name) { return { name: name, wins: wins[name] }; })
    .sort(function (x, y) { return y.wins - x.wins; })
    .slice(0, 5);
  const medals = ["🥇", "🥈", "🥉", "4.", "5."];
  const rows = ranking.map(function (r, i) {
    return `<div class="lb-row"><span>${medals[i]} ${escapeHtml(r.name)}</span><b>${r.wins} win${r.wins > 1 ? "s" : ""}</b></div>`;
  });
  return `<div class="lb-title">Top Players</div>${rows.join("")}`;
}

function buildMatchList(matches) {
  if (matches.length === 0) return "";
  const rows = matches.map(function (m) {
    const date = new Date(m.created_at).toLocaleDateString();
    return `<div class="lb-row match"><span>${escapeHtml(m.player1)} <b>${m.score1}</b> – <b>${m.score2}</b> ${escapeHtml(m.player2)}
      <small>${date} · winner: ${escapeHtml(m.winner)}</small></span>
      <button class="del" onclick="deleteMatch('${m.id}')" title="Delete">🗑</button></div>`;
  });
  return `<div class="lb-title">Match History</div><div class="lb-list">${rows.join("")}</div>`;
}

/* ---------- SMALL HELPERS ---------- */
function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* ---------- SOUND (Web Audio, no files needed) ---------- */
let audioCtx = null;
function beep(freq, duration, delay) {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const start = audioCtx.currentTime + (delay || 0);
    osc.start(start);
    osc.stop(start + duration);
  } catch (e) { /* sound not supported: ignore */ }
}

function playSound(kind) {
  if (kind === "click") beep(520, 0.08);
  else if (kind === "tick") beep(330, 0.1);
  else if (kind === "shoot") beep(880, 0.25);
  else if (kind === "tie") beep(300, 0.3);
  else if (kind === "win") [523, 659, 784].forEach(function (f, i) { beep(f, 0.18, i * 0.12); });
}

/* ---------- VISUAL EFFECTS ---------- */
function flash(kind) {                                   // full-screen color flash
  const el = document.createElement("div");
  el.className = "flash " + kind;
  document.body.appendChild(el);
  el.addEventListener("animationend", function () { el.remove(); });
}

function spawnConfetti() {
  const pieces = ["🎉", "✨", "🎊", "⭐"];
  for (let i = 0; i < 16; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    el.textContent = pieces[Math.floor(Math.random() * pieces.length)];
    el.style.left = Math.random() * 100 + "vw";
    el.style.animationDelay = Math.random() * 0.3 + "s";
    document.body.appendChild(el);
    el.addEventListener("animationend", function () { el.remove(); });
  }
}

/* ---------- THEME + SOUND TOGGLES ---------- */
try {
  const saved = localStorage.getItem("rps_theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
} catch (e) { /* storage blocked: use system theme */ }

function toggleTheme() {
  const isDark = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() === "#14161f";
  const next = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("rps_theme", next); } catch (e) { /* ignore */ }
}

function toggleSound() { soundOn = !soundOn; render(); }

/* ---------- GAME LOGIC ---------- */
// decides who wins one round (switch + if/else)
function getRoundResult(a, b) {
  switch (a) {
    case "rock": case "paper": case "scissors": break;
    default: return "invalid";
  }
  if (a === b) return "tie";
  if (rules[a] === b) return "playerA";
  return "playerB";
}

function startGame() {
  const n1 = document.getElementById("p1name").value.trim() || "Player 1";
  const n2 = document.getElementById("p2name").value.trim() || "Player 2";
  newMatch(n1, n2);
}

function newMatch(nameA, nameB) {
  playerA = new Player(nameA);
  playerB = new Player(nameB);
  history = []; lastRound = null; turn = "A"; phase = "pick"; busy = false;
  render();
}

function rematch() { newMatch(playerA.name, playerB.name); }         // same players, fresh scores
function newPlayers() { playerA = null; playerB = null; phase = "setup"; render(); }

// a player clicks a choice: show the lock-in effect, then move on
async function pick(choice) {
  if (busy || phase !== "pick") return;
  busy = true;
  playSound("click");
  document.querySelectorAll(".choice-btn").forEach(function (btn) {
    btn.classList.add(btn.dataset.choice === choice ? "selected" : "dim");
  });
  await sleep(550);
  if (turn === "A") {
    pendingChoiceA = choice;
    turn = "B";
    busy = false;
    render();
  } else {
    await playRound(choice);
  }
}

// both picked: "Rock... Paper... Scissors... SHOOT!" then reveal
async function playRound(choiceB) {
  phase = "countdown";
  render();
  const words = ["Rock", "Paper", "Scissors", "SHOOT!"];
  const wordEl = document.getElementById("countWord");
  for (let i = 0; i < words.length; i++) {                           // LOOP
    wordEl.textContent = words[i];
    wordEl.classList.remove("pop");
    void wordEl.offsetWidth;                                         // restarts the animation
    wordEl.classList.add("pop");
    playSound(i === words.length - 1 ? "shoot" : "tick");
    await sleep(600);
  }

  const result = getRoundResult(pendingChoiceA, choiceB);
  let winnerText = "It's a tie!";
  if (result === "playerA") { playerA.addWin(); winnerText = playerA.name + " wins the round!"; }
  else if (result === "playerB") { playerB.addWin(); winnerText = playerB.name + " wins the round!"; }

  lastRound = { a: pendingChoiceA, b: choiceB, result: result, winnerText: winnerText };
  history.unshift(lastRound);
  pendingChoiceA = null;
  phase = "reveal";
  busy = false;
  render();

  if (result === "tie") { flash("tie"); playSound("tie"); }
  else { flash("win"); spawnConfetti(); playSound("win"); }
}

function matchIsOver() { return playerA.score >= WIN_TARGET || playerB.score >= WIN_TARGET; }

function nextRound() {
  phase = matchIsOver() ? "over" : "pick";
  turn = "A";
  if (phase === "over") saveStatus = db ? "Saving result…" : "Database not connected — result not saved.";
  render();
  if (phase === "over") {
    spawnConfetti();
    playSound("win");
    if (db) saveMatch();
  }
}

/* ---------- SCREEN PIECES ---------- */
function controls() {
  return `<div class="controls">
    <button onclick="toggleSound()" title="Sound on/off">${soundOn ? "🔊" : "🔇"}</button>
    <button onclick="toggleTheme()" title="Light/dark">🌓</button></div>`;
}

function renderScoreboard() {
  function pips(score) {                                             // one dot per round win needed
    let dots = "";
    for (let i = 0; i < WIN_TARGET; i++) dots += `<span class="pip ${i < score ? "filled" : ""}"></span>`;
    return dots;
  }
  return `<div class="scoreboard">
    <div class="sb-player">${escapeHtml(playerA.name)}<div class="pips">${pips(playerA.score)}</div></div>
    <div class="sb-player">${escapeHtml(playerB.name)}<div class="pips">${pips(playerB.score)}</div></div>
  </div>`;
}

function renderChoiceButtons() {
  return choices.map(function (c) {                                  // HIGHER-ORDER FUNCTION (map)
    const key = c[0].toUpperCase();
    return `<button class="choice-btn" data-choice="${c}" onclick="pick('${c}')">
      <span class="hand">${hands[c]}</span><span class="label">${c}</span><span class="key">Press ${key}</span></button>`;
  }).join("");
}

function renderHistory() {
  if (history.length === 0) return "";
  const rows = history.map(function (h, i) {
    return `<div>Round ${history.length - i}: ${hands[h.a]} vs ${hands[h.b]} — ${escapeHtml(h.winnerText)}</div>`;
  });
  return `<div class="history">${rows.join("")}</div>`;
}

/* ---------- RENDER: one function draws whichever screen we are on ---------- */
function render() {
  const app = document.getElementById("app");
  app.style.animation = "none"; void app.offsetWidth; app.style.animation = "";   // replay fade-in

  if (phase === "setup") {
    app.innerHTML = `${controls()}
      <div class="trophy">✊ ✋ ✌️</div><h1>Rock · Paper · Scissors</h1>
      <div class="sub">2 players · first to ${WIN_TARGET} round wins takes the match</div>
      <input id="p1name" placeholder="Player 1 name" maxlength="14" autofocus>
      <input id="p2name" placeholder="Player 2 name" maxlength="14">
      <button class="wide" onclick="startGame()">Start Game</button>
      <div class="actions"><button class="ghost" onclick="showLeaderboard()">🏆 Leaderboard</button></div>
      <div class="hint">Rock beats Scissors · Scissors beats Paper · Paper beats Rock</div>`;
    return;
  }

  if (phase === "pick") {
    const me = turn === "A" ? playerA : playerB;
    const other = turn === "A" ? playerB : playerA;
    const note = turn === "A"
      ? `Pick secretly — don't let ${escapeHtml(other.name)} see!`
      : `🔒 ${escapeHtml(playerA.name)} has locked in. Your turn!`;
    app.innerHTML = `${controls()}<h1>Round ${history.length + 1}</h1>${renderScoreboard()}
      <div class="turn-banner">${escapeHtml(me.name)}, choose your move</div>
      <div class="hint">${note}</div>
      <div class="choices">${renderChoiceButtons()}</div>
      <div class="hint">Tip: you can also press R, P or S on the keyboard</div>
      ${renderHistory()}
      <div class="actions"><button class="ghost" onclick="newPlayers()">Quit Game</button></div>`;
    return;
  }

  if (phase === "countdown") {
    app.innerHTML = `${controls()}<h1>Round ${history.length + 1}</h1>${renderScoreboard()}
      <div class="count-stage"><div class="fist left">✊</div><div class="fist right">✊</div></div>
      <div id="countWord" class="count-word">Get ready…</div>`;
    return;
  }

  if (phase === "reveal") {
    const r = lastRound;
    const cls = function (who) { return r.result === "tie" ? "" : (r.result === who ? "winner" : "loser"); };
    app.innerHTML = `${controls()}<h1>Round ${history.length}</h1>${renderScoreboard()}
      <div class="battle">
        <div class="fighter left ${cls("playerA")}"><div class="pic">${hands[r.a]}</div><div class="who">${escapeHtml(playerA.name)}</div></div>
        <div class="vs">VS</div>
        <div class="fighter right ${cls("playerB")}"><div class="pic"><span class="hand-icon">${hands[r.b]}</span></div><div class="who">${escapeHtml(playerB.name)}</div></div>
      </div>
      <div class="result ${r.result === "tie" ? "tie" : "win"}">${escapeHtml(r.winnerText)}</div>
      <div class="actions"><button onclick="nextRound()">${matchIsOver() ? "See Final Result ▶" : "Next Round ▶"}</button></div>
      <div class="hint">Press Enter to continue</div>`;
    return;
  }

  if (phase === "leaderboard") {
    app.innerHTML = `${controls()}<h1>🏆 Leaderboard</h1>
      <div id="lbBody" class="sub">Loading…</div>
      <div class="actions"><button onclick="backFromBoard()">◀ Back</button></div>`;
    return;
  }

  // phase === "over"
  const champ = playerA.score >= WIN_TARGET ? playerA : playerB;
  app.innerHTML = `${controls()}<div class="trophy">🏆</div>
    <div class="match-winner">${escapeHtml(champ.name)} wins the match!</div>
    <div class="sub">Final score — ${escapeHtml(playerA.name)}: ${playerA.score} · ${escapeHtml(playerB.name)}: ${playerB.score}</div>
    ${renderHistory()}
    <div id="saveStatus" class="hint">${saveStatus}</div>
    <div class="actions"><button onclick="rematch()">Rematch</button><button class="ghost" onclick="newPlayers()">New Players</button></div>
    <div class="actions"><button class="ghost" onclick="showLeaderboard()">🏆 Leaderboard</button></div>`;
}

/* ---------- KEYBOARD SHORTCUTS ---------- */
document.addEventListener("keydown", function (e) {
  const k = e.key.toLowerCase();
  if (phase === "setup" && k === "enter") startGame();
  else if (phase === "pick" && keyMap[k]) pick(keyMap[k]);
  else if (phase === "reveal" && k === "enter") nextRound();
});

render();
