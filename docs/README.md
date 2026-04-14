# CycloneDX Assessors Studio Documentation

The documentation site for CycloneDX Assessors Studio, built with [Astro](https://astro.build/) and [Starlight](https://starlight.astro.build/). The production site is served at [docs.assessor.studio](https://docs.assessor.studio).

## Prerequisites

Node.js 20 or later is required.

## Local development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

The site is served at `http://localhost:4321`. Edits to `src/content/docs/*.md` reload live.

## Build

Produce a static site in `dist/`:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Project layout

```
docs/
├── astro.config.mjs              Starlight configuration and sidebar
├── src/
│   ├── assets/                   Logo and shared imagery
│   ├── content/
│   │   └── docs/                 All documentation pages (Markdown / MDX)
│   └── styles/
│       └── theme.css             Theme overrides matching assessors.studio
└── public/                       Static files copied to site root
```

## Writing content

Pages live in `src/content/docs/`. Each page is a Markdown file with a small frontmatter block:

```markdown
---
title: Page title
description: One-sentence summary used for SEO and social previews.
---

Body content in Markdown.
```

The sidebar is declared in `astro.config.mjs`. Add a new page by creating the Markdown file and adding a matching `slug` entry to the appropriate sidebar group.

## Deployment

The site is deployed as a static bundle. Any static host works (Cloudflare Pages, Netlify, Vercel, S3 + CloudFront, GitHub Pages). Point `docs.assessor.studio` at the host and serve the contents of `dist/` from the root.

## Style guide

The docs avoid supply-chain inventory terminology in favor of attestation and assurance language, matching the positioning of the main Assessors Studio product.

## License

Apache 2.0
