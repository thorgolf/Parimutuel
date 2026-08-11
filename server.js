const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// DATA_DIR should point at a Railway persistent volume in production (same pattern as
// the golf winnings tracker) so bets survive redeploys. Falls back to this folder for local dev.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'bets.json');
const BET_AMOUNT_CAP = 10;

function loadBets() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveBets(bets) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(bets, null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// All submitted bets, across every bettor — powers the shared "All Bets" view.
app.get('/api/bets', (req, res) => {
  res.json(loadBets());
});

// One bettor's current submission, so they can resume/edit from any device.
app.get('/api/bets/:bettor', (req, res) => {
  const all = loadBets();
  const mine = all.filter((b) => b.bettor === req.params.bettor);
  res.json(mine);
});

// Submit (or replace) a bettor's full set of picks. Re-submitting overwrites their
// previous entry entirely rather than appending duplicate rows.
app.post('/api/bets', (req, res) => {
  const { bettor, picks } = req.body || {};
  if (!bettor || typeof bettor !== 'string' || !Array.isArray(picks)) {
    return res.status(400).json({ error: 'Request must include a bettor name and a picks array.' });
  }

  const byFlight = {};
  for (const p of picks) {
    if (!p || typeof p.flight !== 'string' || typeof p.golfer !== 'string') {
      return res.status(400).json({ error: 'Each pick needs a flight and a golfer.' });
    }
    const amt = Number(p.amount);
    if (!Number.isFinite(amt) || amt < 0 || Math.floor(amt) !== amt) {
      return res.status(400).json({ error: `Amount for ${p.golfer} must be a whole dollar number.` });
    }
    byFlight[p.flight] = (byFlight[p.flight] || 0) + amt;
  }
  for (const flight in byFlight) {
    if (byFlight[flight] !== BET_AMOUNT_CAP) {
      return res.status(400).json({ error: `${flight} totals $${byFlight[flight]}, not exactly $${BET_AMOUNT_CAP}.` });
    }
  }

  let all = loadBets();
  all = all.filter((b) => b.bettor !== bettor);
  const timestamp = new Date().toISOString();
  picks.forEach((p) => {
    const amt = Number(p.amount);
    if (amt > 0) {
      all.push({ bettor, flight: p.flight, golfer: p.golfer, amount: amt, timestamp });
    }
  });
  saveBets(all);
  res.json({ status: 'ok', savedPicks: picks.length });
});

// Clear one bettor's submission (used by "Clear My Bets" — never wipes anyone else's).
app.delete('/api/bets/:bettor', (req, res) => {
  let all = loadBets();
  const before = all.length;
  all = all.filter((b) => b.bettor !== req.params.bettor);
  saveBets(all);
  res.json({ status: 'ok', removed: before - all.length });
});

app.listen(PORT, () => {
  console.log(`Parimutuel betting app running on port ${PORT}`);
  console.log(`Storing bets in: ${DATA_FILE}`);
});
