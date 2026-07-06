# Y-core

Y-core is a desktop application built with Electron + React that enhances your Steam gaming experience with a modern UI, game library management, store integration, and extensive customization options.

## What's in this repo?

This repository contains the **client-side source code** of Y-core — the Electron + React application that users install on their machines. The code is published here for **transparency** so users can verify the client is clean and contains no malware.

### Included
- `src/` — Full React UI (pages, components, stores, i18n, utilities)
- `electron/` — Electron main process structure (window management, auth, config, logs)
- `packages/shared/` — Shared TypeScript types
- `public/` — App icons and assets
- Configuration files (`vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, etc.)

### Not included (private)
The following components are **proprietary** and not part of this public repository:
- **API backend** — Server-side code handling game data, auth, depot keys
- **Native DLLs** — Compiled native modules for Steam integration
- **Steam injection logic** — DLL injection, depot key injection, manifest sync
- **Database schema** — Supabase migrations and schema

These private components are necessary for the full functionality of Y-core but are kept closed-source to protect the project's integrity.

## Tech Stack

- **Electron** — Desktop application framework
- **React + TypeScript** — UI framework
- **Vite** — Build tool and dev server
- **TailwindCSS** — Styling
- **Zustand** — State management
- **React Router** — Navigation
- **i18n** — Multi-language support (7 languages: ES, EN, FR, PT, DE, ZH, HI)

## Features

- **Game Library** — Browse and manage your Steam games
- **Store** — Discover and install games
- **Online Fix** — Multiplayer compatibility checking
- **Customization Panel** — Personalize your experience:
  - Custom background image with blur, opacity, overlay controls
  - Custom accent color picker
  - Sidebar and titlebar opacity sliders
  - Drag-and-drop navigation item reordering
- **Settings** — Account management, content filters, log configuration
- **Auto-updater** — Automatic updates on app launch

## Development

### Prerequisites
- Node.js 18+
- pnpm

### Setup
```bash
pnpm install
pnpm electron:dev
```

### Build
```bash
pnpm vite build
```

### Environment Variables
Copy `.env.example` to `.env` and configure:
```
VITE_YCORE_API_URL=http://localhost:3000
```

## License

This client code is provided for transparency purposes. All rights reserved.

## Community

Join our [Discord](https://discord.gg/Z2CzV884zE) for support and updates.
