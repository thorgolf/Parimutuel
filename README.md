# Parimutuel Flight Betting

A small Node/Express app for a golf club parimutuel betting pool. Each bettor picks their
name, bets exactly $10 per flight (split across any number of golfers, whole dollars only),
and submits. Everyone's bets are stored in a shared JSON file on the server and shown live
in the "All Submitted Bets" section.

## Local development

```
npm install
npm start
```

Then open http://localhost:3000

## Deploying (GitHub + Railway)

Same pattern as the golf winnings tracker:

1. **Create a GitHub repo** and add all these files (`server.js`, `package.json`, `public/index.html`, `.gitignore`, this README). You can drag-and-drop them into a new repo on github.com — no git command line required.
2. **In Railway**, create a new project from that GitHub repo (or connect it to an existing project the same way you did before).
3. **Add a persistent volume** and mount it (e.g. at `/data`), then set the `DATA_DIR` variable to that mount path (e.g. `DATA_DIR=/data`). This is what makes submitted bets survive redeploys — without it, every redeploy would start from an empty `bets.json`.
4. Railway auto-detects the `start` script and runs `npm start`. No other environment variables are required.
5. Once deployed, Railway gives you a public URL (something like `your-app.up.railway.app`) — that's the link to send to bettors.

## API

- `GET /api/bets` — every submitted bet (used by the shared "All Submitted Bets" view).
- `GET /api/bets/:bettor` — one bettor's current submission (used to reload their picks when they select their name).
- `POST /api/bets` — body `{ "bettor": "Last, First", "picks": [{ "flight": "...", "golfer": "...", "amount": 10 }, ...] }`. Validates every flight totals exactly $10, and replaces (rather than duplicates) that bettor's previous submission.
- `DELETE /api/bets/:bettor` — clears one bettor's own submission only.

Bets are stored in `bets.json` inside `DATA_DIR` (defaults to the project folder for local dev).
