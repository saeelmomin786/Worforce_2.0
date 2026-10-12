# Workforce website

The public website for Workforce 2.0, served from the repository root at https://workforce.trackmystartup.com/.

The redesign keeps all 29 page routes and the installer, release metadata, search-verification file and application icons. Task models are provided and selected by Workforce.

## Build and preview

Run from the repository root:

```sh
npm --prefix .website ci
npm --prefix .website run build
npm --prefix .website test
npm --prefix .website run preview
```

Preview: http://127.0.0.1:4174/. Build regenerates the static pages and assets at the repository root. Existing static hosting continues to serve that root without needing a new deployment framework.

## Maintenance

- Page text: .website/content.json.
- Layout and styles: .website/build.mjs and .website/styles.css.
- 3D workflow: .website/scene.js.
- User-controlled Remotion explainer: .website/explainer.jsx.
- Search metadata: .website/search.mjs and .website/robots.source.txt.
- Downloads: releases.json remains the source of truth; cards are updated at build time and refreshed when the download page opens. install.ps1 is retained unchanged.
- Browser checks: start the preview, then run node qa.mjs inside .website (uses installed Microsoft Edge).

Canonical URLs and social previews use the production hostname. Crawler permissions are preserved, and builder files are excluded from crawling.
