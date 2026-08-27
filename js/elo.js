// ================= Elo rating system =================
// One rating per signed-in user per game type, stored in Firestore at
// elo/{uid} = { kap, checkers, cothu, chess }.
//
// Online-mode results only ever update the LOCAL player's own document.
// At connect time both clients exchange a snapshot of their own current
// ratings (see network.js), so after a game each client can independently
// run the same standard Elo formula and write only to its own doc — no
// client ever needs write access to another user's rating.

const db = firebase.firestore();
const ELO_DEFAULT = 1200;
const ELO_K = 32;
const ELO_GAMES = ["kap", "checkers", "cothu", "chess"];

let myElo = null;       // { kap, checkers, cothu, chess } for the signed-in user
let opponentElo = null; // same shape — snapshot from the connected peer, online mode only

function blankElo() {
  const e = {};
  for (const g of ELO_GAMES) e[g] = ELO_DEFAULT;
  return e;
}

async function loadMyElo(uid) {
  try {
    const doc = await db.collection("elo").doc(uid).get();
    if (doc.exists) {
      myElo = Object.assign(blankElo(), doc.data());
    } else {
      myElo = blankElo();
      await db.collection("elo").doc(uid).set(myElo);
    }
  } catch (e) {
    console.error("[Elo] failed to load rating:", e);
    myElo = blankElo();
  }
  updateEloDisplay();
}

function expectedScore(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

// actualScore: 1 = win, 0.5 = draw, 0 = loss (from the local player's perspective).
// Computes synchronously so the UI updates instantly; the Firestore write
// happens in the background.
function applyEloResult(game, actualScore) {
  if (!currentUser || !myElo || !opponentElo) return null;
  const before = myElo[game];
  const expected = expectedScore(before, opponentElo[game]);
  const after = Math.round(before + ELO_K * (actualScore - expected));
  myElo[game] = after;
  db.collection("elo").doc(currentUser.uid).update({ [game]: after })
    .catch(e => console.error("[Elo] failed to save rating:", e));
  updateEloDisplay();
  return { before, after, delta: after - before };
}

function updateEloDisplay() {
  const line = document.getElementById("eloRatingLine");
  if (!line) return;
  if (!myElo || !activeGame) { line.textContent = ""; return; }
  line.textContent = t("yourRating", myElo[activeGame]);
}

// Called after every game ends (win, loss, or draw). No-ops outside online
// mode, or if no opponent rating snapshot was exchanged.
function maybeUpdateEloAfterGame(actualScore) {
  const line = document.getElementById("eloDeltaLine");
  if (line) { line.textContent = ""; line.className = "elo-delta-line"; }
  if (mode !== "online" || !opponentElo) return;
  const result = applyEloResult(activeGame, actualScore);
  if (result && line) {
    const sign = result.delta > 0 ? "+" + result.delta : String(result.delta);
    line.textContent = t("eloDeltaText", sign, result.after);
    line.className = "elo-delta-line " + (result.delta > 0 ? "elo-up" : result.delta < 0 ? "elo-down" : "");
  }
}

auth.onAuthStateChanged((user) => {
  if (user) {
    loadMyElo(user.uid);
  } else {
    myElo = null;
    opponentElo = null;
    updateEloDisplay();
  }
});
