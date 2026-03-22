# BibSure — Architecture Spec & Changelog

> Maintained by: Kavih AI Technologies Pvt. Ltd.
> Follow PickrSwipe conventions: single HTML file MVP, Vercel deploy, changelog at bottom.

---

## Project Overview

BibSure validates academic citations against public databases to detect AI-hallucinated (fake) references. It works entirely client-side — no server, no uploads.

**Live URL:** TBD (deploy to Vercel)
**GitHub:** TBD (create under kavih-ai org)

---

## Architecture

### Stack
- Pure client-side HTML/CSS/JS — zero build tooling, zero dependencies installed
- Hosted on Vercel (static, free tier)
- Validated against CrossRef REST API (free, no auth, CORS-enabled)
- PDF parsing via PDF.js CDN (3.11.174)
- Vercel Analytics via `/_vercel/insights/script.js` script tag

### Key Files
```
bibsure/
  index.html        ← entire app
  privacy.html      ← privacy policy
  terms.html        ← terms of use
  agents.md         ← this file (architecture + changelog)
  ROADMAP.md        ← future features
  PROMPT.md         ← original project brief (gitignored)
  .gitignore
  README.md
```

### Source Types
| Input | Parser | Validator |
|---|---|---|
| `.bib` | Custom regex BibTeX parser | CrossRef API |
| `.ris` | Tag-based RIS parser | CrossRef API |
| `.pdf` | PDF.js text extraction + heuristic ref parser | CrossRef API |
| Paste | Auto-detect BibTeX or RIS | CrossRef API |

### Validation Flow
1. Parse file → array of `{ title, author, year, journal, doi, ... }`
2. For each citation:
   - If DOI present → `GET https://api.crossref.org/works/{doi}` (definitive)
   - Else → `GET https://api.crossref.org/works?query.bibliographic={title+author}&rows=1`
3. Compare returned metadata using word-overlap title similarity
4. Return `{ status, confidence (0–100), note, foundDoi }`
5. 120ms delay between requests (CrossRef polite pool)

### Status Types
| Status | Meaning | Confidence |
|---|---|---|
| `verified` | ≥80% title match or DOI confirmed | 80–100% |
| `partial` | 40–79% match, possible typo or year mismatch | 40–79% |
| `not_found` | <40% match or 404 on DOI | 0–39% |
| `unknown` | Insufficient metadata to query | — |

### APIs Used
- **CrossRef REST API** — `api.crossref.org` — free, no auth, CORS OK
  - Works endpoint: `/works/{doi}` and `/works?query.bibliographic=`
  - Polite pool: add email in User-Agent (done via `mailto:` param in future backend)
- **Semantic Scholar** ← TODO Phase 2
- **PubMed E-utilities** ← TODO Phase 2
- **OpenAlex** ← TODO Phase 2

---

## Additional Deliverables

### VSCode Extension (Skeleton)

**Name:** `bibsure-vscode`
**Functionality:**
- Command: `BibSure: Validate .bib file` → opens results panel
- Command: `BibSure: Validate selection` → validate highlighted citation text
- Hover provider: hover over `\cite{key}` in LaTeX → show validation status inline
- Diagnostic provider: red squiggles on unverified citations

**Tech stack:**
- TypeScript extension using `vscode` API
- Calls CrossRef directly from extension (no server needed)
- Results shown in `vscode.window.createWebviewPanel`

**Folder:** `bibsure/vscode-extension/`
**Entry point:** `extension.ts` → `activate()` registers commands

**To create:**
```bash
npm install -g @vscode/generator-code
yo code  # select "New Extension (TypeScript)"
```

---

### Claude Artifact

**Purpose:** Reusable React component that validates a single citation inline.

**Usage:** Paste into Claude.ai → share with researchers who want to validate one citation at a time.

**Artifact type:** React component
**Props:**
```tsx
<CitationValidator
  title="Paper title"
  author="Author Name"
  year="2023"
  doi="10.xxx/xxx"
/>
```
**Output:** Shows verified/not-found badge + CrossRef link.

**To create:** Build in Claude.ai Artifacts tab using React + fetch to CrossRef API.

---

### Custom GPT (ChatGPT Store)

**Name:** BibSure GPT
**Tagline:** "Paste any citation — I'll tell you if it's real or AI-hallucinated."

**System prompt template:**
```
You are BibSure, an academic citation validator. When a user provides a citation:
1. Extract: title, authors, year, journal, DOI (if present)
2. Search CrossRef API at https://api.crossref.org/works?query.bibliographic={title}
3. Compare returned metadata to the user's citation
4. Report: Verified / Partial Match / Not Found with explanation
5. If not found, suggest the user double-check with Google Scholar

Always be honest about uncertainty. Never guess that a citation is real without evidence.
```

**Actions (GPT Actions schema):**
- Action: `GET https://api.crossref.org/works` with `query.bibliographic` param
- Action: `GET https://api.crossref.org/works/{doi}` for DOI lookup

**To submit:** ChatGPT → Explore GPTs → Create → configure above + submit for review.

---

## Revenue Model

| Tier | Price | Features |
|---|---|---|
| Free | $0 | 15 citations/day, .bib/.ris only, basic results |
| Pro | $9.99/mo | Unlimited, PDF upload, CSV export, predatory journal flag |
| Institution | $99/mo | API access, team seats, LMS integration, white-label |
| One-time Report | $2.99 | Full validation PDF report for one paper |

**Other revenue streams:**
- Affiliate: Zotero, Mendeley, Paperpile referral links
- API licensing to journal submission platforms (ScholarOne, Editorial Manager)
- Google AdSense (free tier users)

---

## Name Suggestions (TBD — user to pick after prototype)

| Name | Domain | Vibe |
|---|---|---|
| **BibSure** | bibsure.app | Clear, functional |
| **RefGuard** | refguard.io | Security / protection angle |
| **CiteLens** | citelens.com | Analysis / clarity |
| **TrueCite** | truecite.app | Trust / authenticity |
| **RefVerify** | refverify.com | Enterprise-sounding |
| **HalluciCheck** | hallucicheck.com | Humorous, memorable |
| **ScholarGuard** | scholarguard.io | Academic protection |

---

## Differentiators vs Competitors

| Feature | BibSure | CiteSure | SwanRef | Citea |
|---|---|---|---|---|
| .bib file upload | ✅ | ❌ | ❌ | ❌ |
| .ris file upload | ✅ | ❌ | ❌ | ❌ |
| PDF paper upload | ✅ | ❌ | ❌ | ❌ |
| Bulk validation | ✅ | ❌ (3 max) | ✅ | ✅ |
| Confidence score | ✅ | ❌ | ❌ | ❌ |
| CSV export | ✅ | ❌ | ❌ | ❌ |
| VSCode extension | ✅ (planned) | ❌ | ❌ | ❌ |
| No registration | ✅ | ✅ | ✅ | ✅ |
| Predatory journal detection | 🔜 Phase 2 | ❌ | ❌ | ❌ |

---

## Changelog

### 2026-03-16 — v0.1.0 — Initial MVP
- Single `index.html` with BibTeX parser, RIS parser, CrossRef validation
- PDF upload with PDF.js reference extraction
- Paste citations tab with auto-format detection
- Progress bar + per-citation status cards
- Confidence score + colored status badges
- CSV export
- Privacy + Terms pages
- Vercel Analytics
- Buy Me a Coffee link (kavihai)
- `agents.md`, `ROADMAP.md`, `.gitignore`, `PROMPT.md` created

---
