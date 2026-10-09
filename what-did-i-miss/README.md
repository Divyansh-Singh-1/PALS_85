# What Did I Miss?

A local-first AI micro-app that summarizes unread chats. All processing happens in the browser — your chat data never leaves your device.

## Quick Start

```bash
npm install
npm run dev       # start dev server
npm test          # run tests
npm run build     # production build
```

## Scripts

| Command           | Description                        |
| ----------------- | ---------------------------------- |
| `npm run dev`     | Start Vite dev server              |
| `npm run build`   | Type-check and build for production |
| `npm run preview` | Preview the production build       |
| `npm test`        | Run Vitest tests once              |
| `npm run test:watch` | Run Vitest in watch mode        |
| `npm run lint`    | Run ESLint                         |
| `npm run typecheck` | Run TypeScript type checker      |
| `npm run format`  | Format code with Prettier          |

## Tech Stack

- **Vite** + **React** + **TypeScript** (strict mode)
- **Tailwind CSS** v4
- **Vitest** for testing
- **ESLint** + **Prettier** for code quality

## Security

Security headers are configured via `vercel.json` for production deployment. The CSP is intentionally strict for Phase 1 — it will be loosened in a later phase to allow the AI model host and WASM (`'wasm-unsafe-eval'`).

The CSP is NOT set via a `<meta>` tag in `index.html` because it breaks Vite's dev-mode HMR.

## Deployment

This project is configured for **Vercel**. Connect your GitHub repo to Vercel and it will auto-deploy.

## License

Private — hackathon project.
