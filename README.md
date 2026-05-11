# iTrace - Followback Checker

This project compares **following** and **followers** and shows who is not following you back.

## Mode

1. **Offline mode (Instagram):** Upload Instagram export JSON files and compare locally.
2. **Online mode (Instagram web console):** Run a throttled fetch script in Instagram DevTools console to collect followers/following, then paste JSON into iTrace for comparison.

## Run locally

Install dependencies:

```bash
npm install
```

Start frontend:

```bash
npm run dev
```

No backend server is required.
