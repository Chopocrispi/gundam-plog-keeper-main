# Gundam P-Log Keeper

Vite + React + TypeScript app with shadcn-ui. Includes an Offers panel that can load static prices or fetch live prices via a serverless API.

## Live Offers API

- Endpoint: `/api/offers`
- Query params:
	- `query`: product keywords (e.g., `RGM-89 Jegan`)
	- `grade`: optional grade string (e.g., `High Grade (HG)`)

Example: `/api/offers?query=RGM-89%20Jegan&grade=High%20Grade%20(HG)`

### Local dev

This repository ships a serverless function at `api/offers.mjs`. On platforms like Vercel, this is picked up automatically. For local testing in a Node environment, you can invoke the logic with any serverless adapter or deploy preview.

### Static fallback

The UI reads `public/offers.json` if present, or `public/offers.sample.json` as a fallback. You can pre-generate `public/offers.json` with:

- `npm run offers:fetch -- --query "<name>" --grade "<grade>"`

Then deploy. The UI will prefer the static file and only hit the live API if nothing matches statically.

### Troubleshooting 500s

- Ensure your host supports Node serverless functions (Node.js runtime). The function exports `config = { runtime: 'nodejs' }` to avoid Edge.
- Dependencies required at runtime: `cheerio`, `node-fetch` (both declared in `dependencies`). Your platform must install prod dependencies for functions.
- The function sets a 10s timeout per upstream request and returns a JSON body `{ error, message }` on failures; check logs for `offers api error`.

## Scripts

- `npm run dev` – Start Vite dev server
- `npm run build` – Build the app
- `npm run preview` – Preview build
- `npm run lint` – Lint
- `npm run offers:fetch` – Generate/merge `public/offers.json`

