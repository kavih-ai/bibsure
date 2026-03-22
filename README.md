# BibSure

> Detect AI-hallucinated citations in research papers instantly.

**Live:** [TBD — deploy to Vercel]
**By:** [Kavih AI Technologies Pvt. Ltd.](https://kavihai.com)

## Features

- Upload `.bib` or `.ris` bibliography files — validate all entries in bulk
- Upload a PDF research paper — auto-extract and validate references
- Paste raw citations — auto-detect BibTeX or RIS format
- Confidence score per citation (0–100%)
- Export results as CSV
- 100% client-side — your files never leave your browser

## How It Works

Each citation is checked against the [CrossRef](https://crossref.org) database (150M+ real publications). Citations are scored by title similarity and DOI match.

| Status | Meaning |
|---|---|
| ✓ Verified | Found in CrossRef with ≥80% title match |
| ⚠ Partial | Found but title/year may have errors |
| ✗ Not Found | Not in CrossRef — likely fake or severely misquoted |

## Deploy

```bash
# No build step needed — pure HTML
# Just push index.html to GitHub and connect to Vercel
```

## Development

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

## License

MIT © 2026 Kavih AI Technologies Pvt. Ltd.
