# BibSure — Extension Deployment Guide

## Part 1: VS Code Extension

### Prerequisites

```bash
node --version   # v18+
npm --version    # v9+
```

### Step 1 — Install tooling

```bash
npm install -g @vscode/vsce
```

### Step 2 — Create required icons

The Marketplace requires a 128×128 PNG icon. Place it at:

```
vscode-extension/icons/icon128.png
```

You can use the samurai logo, upscaled to 128px:

```bash
# macOS (using sips)
mkdir -p vscode-extension/icons
sips -z 128 128 "samurai logo.png" --out vscode-extension/icons/icon128.png
```

### Step 3 — Add .vscodeignore

Create `vscode-extension/.vscodeignore`:

```
.vscode/**
node_modules/**
test/**
*.md
.eslintrc*
src/**/*.test.js
```

### Step 4 — Package the extension

```bash
cd vscode-extension
vsce package
# Creates: bibsure-1.0.0.vsix
```

### Step 5 — Test locally before publishing

```bash
# Install into your own VS Code
code --install-extension bibsure-1.0.0.vsix

# Open any .bib file — extension auto-activates
# Or run: Ctrl+Shift+P → "BibSure: Validate Current .bib File"
```

### Step 6 — Create a publisher account

1. Go to https://marketplace.visualstudio.com/manage
2. Sign in with a Microsoft account
3. Click **Create publisher**
4. Set ID: `kavihai` (must match `"publisher"` in package.json)

### Step 7 — Generate a Personal Access Token (PAT)

1. Go to https://dev.azure.com → User Settings → Personal Access Tokens
2. **New Token** → Name: `vsce-publish`
3. Organization: **All accessible organizations**
4. Scopes: **Marketplace → Manage**
5. Copy the token immediately

### Step 8 — Login and publish

```bash
cd vscode-extension
vsce login kavihai    # paste your PAT when prompted
vsce publish          # publishes version from package.json

# To bump version and publish in one command:
vsce publish minor    # 1.0.0 → 1.1.0
vsce publish patch    # 1.0.0 → 1.0.1
```

### Step 9 — Verify

- Extension appears at: https://marketplace.visualstudio.com/items?itemName=kavihai.bibsure
- Takes 5–15 minutes to appear in search results

### Updating the extension

```bash
cd vscode-extension
# Edit package.json version field, then:
vsce publish
```

### Adding a license key gate (for paid plans)

In `src/extension.js`, add this check at the top of `activate()`:

```js
const config = vscode.workspace.getConfiguration('bibsure');
const licenseKey = config.get('licenseKey') || '';

// Free tier: validate up to 20 citations then prompt
// Paid tier: validate if licenseKey is valid
async function isKeyValid(key) {
  if (!key) return false;
  try {
    const r = await fetch('https://bibsure.kavihai.com/api/validate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    return r.ok;
  } catch (_) { return false; }
}
```

Add to `package.json` contributes.configuration.properties:

```json
"bibsure.licenseKey": {
  "type": "string",
  "default": "",
  "description": "Your BibSure license key (from bibsure.kavihai.com). Required for unlimited validation."
}
```

---

## Part 2: Zotero Plugin

### Prerequisites

- Zotero 6 or 7 installed (for testing)
- `zip` command available (macOS: built-in)

### Step 1 — Verify directory structure

```
zotero-plugin/
├── manifest.json       ← already correct
├── bootstrap.js        ← copy from src/ to root
├── icons/
│   ├── icon48.png
│   └── icon96.png
└── src/
    └── bootstrap.js    ← original
```

```bash
cd zotero-plugin
cp src/bootstrap.js ./bootstrap.js

# Create icons from samurai logo
mkdir -p icons
sips -z 48 48 "../samurai logo.png" --out icons/icon48.png
sips -z 96 96 "../samurai logo.png" --out icons/icon96.png
```

### Step 2 — Package as .xpi

```bash
cd zotero-plugin
zip -r ../bibsure-zotero-1.0.0.xpi \
  manifest.json \
  bootstrap.js \
  icons/

# Verify contents
unzip -l ../bibsure-zotero-1.0.0.xpi
```

A valid Zotero 7 plugin XPI must have `manifest.json` and `bootstrap.js` at the **root** of the zip (not in a subfolder).

### Step 3 — Test locally

1. Open Zotero
2. **Tools → Plugins** (Zotero 7) or **Tools → Add-ons** (Zotero 6)
3. Click the gear icon → **Install Plugin From File...**
4. Select `bibsure-zotero-1.0.0.xpi`
5. Click **Install Now** → **Restart Now**
6. After restart: **Tools → BibSure — Validate Selected Citations**

### Step 4 — Test the validation

1. Select 1–5 items in your Zotero library
2. Tools → BibSure — Validate Selected Citations
3. Wait for the progress window
4. Items get tagged: `BibSure: Verified`, `BibSure: Not Found`, etc.
5. A summary dialog shows results

### Step 5 — Publish to Zotero Plugin Repository

The official Zotero plugin directory is a GitHub repository:

1. Fork https://github.com/zotero/zotero-plugins
2. Add your plugin to `_data/plugins.json`:

```json
{
  "name": "BibSure",
  "description": "Validate citations against CrossRef, Semantic Scholar, PubMed, arXiv, bioRxiv, OpenAlex & DBLP. Detect AI-hallucinated references.",
  "id": "bibsure@kavihai.com",
  "repo": "kavihai/bibsure-zotero",
  "releases": [
    {
      "targetZoteroVersion": "7",
      "tagName": "v1.0.0"
    },
    {
      "targetZoteroVersion": "6",
      "tagName": "v1.0.0"
    }
  ]
}
```

3. Open a pull request — Zotero team reviews within a few days

### Step 6 — Host XPI for auto-updates (GitHub Releases)

```bash
# Create a GitHub repo: github.com/kavihai/bibsure-zotero
git init
git add .
git commit -m "Initial release v1.0.0"
git remote add origin https://github.com/kavihai/bibsure-zotero.git
git push -u origin main

# Create a release and attach the XPI
gh release create v1.0.0 ../bibsure-zotero-1.0.0.xpi \
  --title "BibSure v1.0.0" \
  --notes "Initial release. Validates citations against 7 academic databases."
```

Zotero will use the GitHub release URL for auto-update checks.

### Updating the plugin

```bash
# Bump version in manifest.json, then repackage:
cd zotero-plugin
zip -r ../bibsure-zotero-1.0.1.xpi manifest.json bootstrap.js icons/
gh release create v1.0.1 ../bibsure-zotero-1.0.1.xpi
```

---

---

## Part 3: Hosting the Website Online

The BibSure website is a static HTML/JS site with optional serverless API functions
(`api/checkout.js`, `api/webhook.js`). The recommended host is **Vercel** — it handles
both the static pages and the API functions with zero configuration.

---

### Option A: Vercel (Recommended)

Vercel is free for personal projects, deploys in ~30 seconds, gives you a CDN, HTTPS,
and runs the `api/` serverless functions automatically.

#### Method 1 — Deploy via GitHub (best for ongoing work)

```bash
# 1. Create a GitHub repository
git init
git add .
git commit -m "Initial BibSure deployment"

# Create repo at github.com (via website or CLI):
gh repo create kavihai/bibsure --public --push --source=.
```

Then in Vercel:

1. Go to https://vercel.com → **Add New Project**
2. Click **Import Git Repository** → connect GitHub → select `kavihai/bibsure`
3. Framework Preset: **Other** (it's plain HTML, not Next.js)
4. Root Directory: leave as `/`
5. Click **Deploy**

Vercel gives you a URL like `https://bibsure-kavihai.vercel.app` instantly.

**Every `git push` to main auto-deploys.** Every pull request gets a preview URL.

#### Method 2 — Deploy via Vercel CLI (fastest first deploy)

```bash
# Install Vercel CLI
npm install -g vercel

# From your project directory:
cd /path/to/bibsure
vercel

# Follow prompts:
# Set up and deploy? Y
# Which scope? (your account)
# Link to existing project? N
# Project name: bibsure
# Directory: ./
# Override settings? N
```

Your site is live in ~20 seconds. Run `vercel --prod` to promote to production.

#### Add a custom domain

```bash
vercel domains add bibsure.kavihai.com

# Then in your DNS provider (GoDaddy / Cloudflare / Google Domains):
# Add CNAME record:
#   Name: bibsure
#   Value: cname.vercel-dns.com
```

Or do it in the Vercel Dashboard → Project → Settings → Domains → Add Domain.

#### Add environment variables (needed for payments)

```bash
# Via CLI:
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add RESEND_API_KEY production
vercel env add SITE_URL production    # https://bibsure.kavihai.com

# Or via Dashboard: Project → Settings → Environment Variables
```

Then redeploy for the variables to take effect:
```bash
vercel --prod
```

#### Vercel project structure for API functions

Vercel auto-detects any file in the `api/` folder as a serverless function:

```
bibsure/
├── index.html          → https://bibsure.kavihai.com/
├── demo.html           → https://bibsure.kavihai.com/demo.html
├── api/
│   ├── checkout.js     → https://bibsure.kavihai.com/api/checkout
│   └── webhook.js      → https://bibsure.kavihai.com/api/webhook
├── vercel.json         → config (raw body for webhook)
└── package.json        → lists stripe, resend as dependencies
```

No build step required — Vercel serves HTML files directly.

---

### Option B: GitHub Pages (Free, no API functions)

Use this if you don't need the payment API (e.g. directing users to Stripe payment links
instead of hosting your own checkout endpoint).

```bash
# 1. Push to GitHub (see Method 1 above)

# 2. In GitHub repo → Settings → Pages
#    Source: Deploy from a branch
#    Branch: main  /  Folder: / (root)
#    Save

# Site is live at: https://kavihai.github.io/bibsure/
```

To use a custom domain with GitHub Pages:
1. Add a file named `CNAME` at the project root:
   ```
   bibsure.kavihai.com
   ```
2. In your DNS: add a CNAME record pointing `bibsure` → `kavihai.github.io`
3. In GitHub Pages settings → Custom domain → enter `bibsure.kavihai.com` → Save

**Limitation:** GitHub Pages cannot run server-side code. The `api/checkout.js` and
`api/webhook.js` functions won't work. Use Vercel instead once you add payments.

---

### Option C: Cloudflare Pages (Free, fast global CDN)

Similar to GitHub Pages but with better performance and Cloudflare's global network.

```bash
# Install Wrangler (Cloudflare CLI)
npm install -g wrangler
wrangler login

# Deploy from local directory
wrangler pages deploy . --project-name=bibsure
```

Or connect via GitHub in the Cloudflare Dashboard → Workers & Pages → Create → Pages →
Connect to Git → select repo → deploy.

Cloudflare Pages supports serverless functions via **Pages Functions** (in a `functions/`
directory), but the syntax differs from Vercel. Stick with Vercel for consistency with
the payment API.

---

### Recommended Setup (all three pieces together)

```
Website hosting:      Vercel (free tier)
Custom domain:        bibsure.kavihai.com via Vercel
API functions:        Vercel serverless (api/checkout.js, api/webhook.js)
VS Code extension:    VS Code Marketplace (publisher: kavihai)
Zotero plugin:        GitHub Releases (kavihai/bibsure-zotero)
Email:                Resend (free tier: 3,000 emails/month)
Key storage:          Upstash Redis via Vercel integration
Payments:             Stripe
```

Total monthly cost before revenue: **$0** (all free tiers).

---

### Vercel Analytics (optional but useful)

Add this to every HTML page's `<head>` to track page views — already in `index.html`:

```html
<script defer src="/_vercel/insights/script.js"></script>
```

Enable in Vercel Dashboard → Project → Analytics → Enable.
Free tier: 2,500 events/month.

---

## Checklist Before Publishing

**Website:**
- [ ] `git push` to GitHub triggers Vercel auto-deploy
- [ ] Custom domain configured in Vercel (DNS CNAME set)
- [ ] HTTPS working (Vercel provisions SSL automatically)
- [ ] Environment variables set in Vercel Dashboard
- [ ] `/_vercel/insights/script.js` loading (Analytics enabled)

**VS Code Extension:**
- [ ] Icon files exist (`icons/icon128.png`)
- [ ] Publisher `kavihai` created on VS Code Marketplace
- [ ] `vsce package` produces `.vsix` with no errors
- [ ] Tested locally with `code --install-extension bibsure-1.0.0.vsix`
- [ ] Published with `vsce publish`

**Zotero Plugin:**
- [ ] `bootstrap.js` at the **root** of the XPI zip (not in `src/`)
- [ ] Icon files exist (`icons/icon48.png`, `icons/icon96.png`)
- [ ] Version in `manifest.json` matches GitHub release tag
- [ ] Tested locally via Tools → Plugins → Install From File
- [ ] GitHub Release created with `.xpi` attached
- [ ] PR submitted to github.com/zotero/zotero-plugins
