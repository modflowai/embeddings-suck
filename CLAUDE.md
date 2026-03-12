# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Interactive demo comparing Full-Text Search (FTS) vs AI embeddings (semantic search) on 1,862 MODFLOW hydrogeology documentation files. Demonstrates that embeddings fail on domain-specific acronyms (SMS, UZF, WEL) while FTS handles them perfectly — and conversely, embeddings excel at conceptual queries.

Live at: gwlink.ai/fts-vs-embeddings

## Commands

```bash
npm start                # Start Express server on port 3001
DATABASE_URL=postgresql://... node scripts/precompute-3d.js  # Regenerate 3D PCA projection
```

No test suite, linter, or build step. The frontend uses vanilla ES modules served statically.

## Architecture

**Backend** (`server.js`): Express server with two API endpoints:
- `POST /api/search` — runs FTS (`ts_rank_cd`/`plainto_tsquery`) and semantic search (`pgvector` cosine distance) in parallel against PostgreSQL, returns top-10 results with timing
- `GET /api/stats` — returns document/repo counts for the UI footer
- Query embeddings are loaded from `embeddings-cache.json` at startup (no OpenAI API calls at runtime)

**Frontend** (`public/`): Single-page app with no build tooling:
- `app.js` — controller: handles query chip clicks, calls `/api/search`, renders dual-column results, generates narrative captions using a hardcoded expected-answers map
- `viz3d.js` — Three.js point cloud of 1,616 document embeddings in 3D (from pre-computed PCA in `points-3d.json`). Highlights query point (red), FTS results (green), semantic results (blue). Points colored by source repository (10 repos)
- `index.html` — layout with theme toggle, query chips (no free-form input), 3D viz container, two-column results grid
- `style.css` — CSS variables for dark/light theming. FTS = green, Semantic = blue, Mixed = yellow. Type scale: xl/base/sm/xs only

**Pre-computation** (`scripts/precompute-3d.js`): Projects 1,536-dim OpenAI embeddings → 3D via PCA (ml-pca). Outputs `public/points-3d.json`. Run once when data changes.

## Database

PostgreSQL 17 with pgvector. Table `mfai_repository_files`:
- `content_tsvector` (tsvector) for FTS
- `embedding` (vector(1536)) for semantic search (OpenAI text-embedding-3-small)

Connection via `DATABASE_URL` env var.

## Key Conventions

- All runtime data is pre-cached (embeddings in JSON, 3D coords in JSON) — zero external API calls during demo use
- HTML sanitized via `escapeHtml()` in `app.js` to prevent XSS from database snippets
- Theme state persisted to localStorage; Three.js background synced by reading `--bg` CSS variable
- Font: Geist (loaded from CDN)
