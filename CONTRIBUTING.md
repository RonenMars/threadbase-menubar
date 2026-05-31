# Contributing

Thanks for considering a contribution.

## Dev setup

```bash
git clone https://github.com/RonenMars/threadbase-menubar.git
cd threadbase-menubar
npm install
npm start    # builds TS + launches Electron
```

You'll also want the [Threadbase Streamer](https://github.com/RonenMars/threadbase-streamer) running locally — the menubar polls its `/healthz` endpoint to drive the tray icon color.

## Code style

- TypeScript for `src/main.ts` and `src/preload.ts`
- Plain JS/CSS for `src/renderer/` (do not convert to TS without setting up a renderer build step)
- `npx biome check .` before committing
- `npx biome format --write .` to auto-format

## Commits

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, etc.

## Issues & PRs

Open an issue first for non-trivial changes so we can align on approach before you write code.

## Scope

See [`.claude/plans/roadmap.md`](.claude/plans/roadmap.md) for planned work and what's out of scope.
