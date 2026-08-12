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
const FLIGHT_COUNT = 4;
const FULL_SUBMISSION_TOTAL = BET_AMOUNT_CAP * FLIGHT_COUNT; // $40 across all 4 flights

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

function isLocked(bettor, allBets) {
  const mine = allBets.filter((b) => b.bettor === bettor);
  const byFlight = {};
  mine.forEach((b) => { byFlight[b.flight] = (byFlight[b.flight] || 0) + Number(b.amount); });
  const flightNames = Object.keys(byFlight);
  if (flightNames.length < FLIGHT_COUNT) return false;
  return flightNames.every((f) => byFlight[f] === BET_AMOUNT_CAP);
}

function isAdmin(req) {
  const configured = process.env.ADMIN_PASSWORD;
  const provided = req.get('X-Admin-Password') || (req.body && req.body.adminPassword);
  return Boolean(configured) && provided === configured;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/bets', (req, res) => {
  res.json(loadBets());
});

app.get('/api/bets/:bettor', (req, res) => {
  const all = loadBets();
  const mine = all.filter((b) => b.bettor === req.params.bettor);
  res.json({ bets: mine, locked: isLocked(req.params.bettor, all) });
});

app.post('/api/bets', (req, res) => {
  const { bettor, picks } = req.body || {};
  if (!bettor || typeof bettor !== 'string' || !Array.isArray(picks)) {
    return res.status(400).json({ error: 'Request must include a bettor name and a picks array.' });
  }

  const existing = loadBets();
  if (isLocked(bettor, existing) && !isAdmin(req)) {
    return res.status(403).json({ error: `${bettor} has already submitted the full $${FULL_SUBMISSION_TOTAL} and is locked in. Contact the admin for corrections.` });
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

  let all = existing.filter((b) => b.bettor !== bettor);
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

app.delete('/api/bets/:bettor', (req, res) => {
  const all = loadBets();
  if (isLocked(req.params.bettor, all) && !isAdmin(req)) {
    return res.status(403).json({ error: `${req.params.bettor} has already submitted the full $${FULL_SUBMISSION_TOTAL} and is locked in. Contact the admin for corrections.` });
  }
  const remaining = all.filter((b) => b.bettor !== req.params.bettor);
  saveBets(remaining);
  res.json({ status: 'ok', removed: all.length - remaining.length });
});

app.get('/api/admin/debug', (req, res) => {
  const keysContainingPassword = Object.keys(process.env).filter((k) => /password|admin/i.test(k));
  res.json({
    adminPasswordSet: Boolean(process.env.ADMIN_PASSWORD),
    adminPasswordLength: process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.length : 0,
    similarKeysFound: keysContainingPassword,
    totalEnvVarCount: Object.keys(process.env).length,
    railwayDetected: Object.keys(process.env).some((k) => k.startsWith('RAILWAY_')),
    dataDirSet: Boolean(process.env.DATA_DIR),
    allEnvKeysSorted: Object.keys(process.env).sort(),
    processUptimeSeconds: Math.round(process.uptime()),
    railwayProjectName: process.env.RAILWAY_PROJECT_NAME,
    railwayEnvironmentName: process.env.RAILWAY_ENVIRONMENT_NAME,
    railwayServiceName: process.env.RAILWAY_SERVICE_NAME,
    railwayServiceId: process.env.RAILWAY_SERVICE_ID,
    railwayEnvironmentId: process.env.RAILWAY_ENVIRONMENT_ID
  });
});

app.delete('/api/admin/bets/:bettor', (req, res) => {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(400).json({ error: 'Admin access is not configured on this server (no ADMIN_PASSWORD set).' });
  }
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }
  const all = loadBets();
  const remaining = all.filter((b) => b.bettor !== req.params.bettor);
  saveBets(remaining);
  res.json({ status: 'ok', removed: all.length - remaining.length });
});

app.listen(PORT, () => {
  console.log(`Parimutuel betting app running on port ${PORT}`);
  console.log(`Storing bets in: ${DATA_FILE}`);
});
