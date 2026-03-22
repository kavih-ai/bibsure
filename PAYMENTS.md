# BibSure — Payment Gateway Integration Guide

## Chosen Stack: Stripe

Stripe is the standard choice for SaaS subscriptions. It handles recurring billing,
failed payment retries, proration, and tax (VAT/GST) automatically.

**Estimated time to first payment: 2–4 hours**

---

## Architecture Overview

```
User clicks "Subscribe $2/mo"
        ↓
Stripe Checkout (hosted page — Stripe handles card input, PCI compliance)
        ↓
User completes payment
        ↓
Stripe webhook → your backend → issue license key → email user
        ↓
User pastes key into VS Code / Zotero / web app
```

No need to build a payment form. Stripe Checkout is a hosted page Stripe maintains.

---

## Step 1 — Create a Stripe account

1. Go to https://dashboard.stripe.com/register
2. Complete business verification (Kavih AI Technologies Pvt. Ltd.)
3. Add bank account for payouts

---

## Step 2 — Create your product and price

In Stripe Dashboard → Products → **+ Add product**:

```
Name: BibSure Scholar
Description: Unlimited citation validation across 7 academic databases.
             VS Code + Zotero plugin access.

Price: $2.00 USD
Billing: Recurring — Monthly
```

Note the **Price ID** shown after saving (format: `price_1AbcXXXXXXXX`). You'll need it.

Optionally create annual price:
```
Price: $20.00 USD  (2 months free)
Billing: Recurring — Yearly
Price ID: price_2AbcXXXXXXXX
```

---

## Step 3 — The simplest backend: a single Vercel serverless function

Create a new file: `api/checkout.js` (Vercel will auto-deploy this as an API endpoint).

```js
// api/checkout.js
// Deploy this to Vercel alongside index.html

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { priceId, email } = req.body;

  // Allowed price IDs — never trust client input
  const allowed = [
    process.env.STRIPE_PRICE_MONTHLY,   // $2/month
    process.env.STRIPE_PRICE_ANNUAL,    // $20/year
  ];
  if (!allowed.includes(priceId)) return res.status(400).json({ error: 'Invalid price' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/#pricing`,
      subscription_data: {
        trial_period_days: 7,   // optional 7-day free trial
        metadata: { product: 'bibsure-scholar' }
      }
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
```

Install the Stripe SDK:
```bash
npm init -y          # if no package.json at project root
npm install stripe
```

---

## Step 4 — Webhook to issue license keys

When Stripe confirms payment, you need to issue a license key and email it to the user.

Create `api/webhook.js`:

```js
// api/webhook.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

function generateLicenseKey() {
  // Format: CC-XXXX-XXXX-XXXX-XXXX
  const part = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CC-${part()}-${part()}-${part()}-${part()}`;
}

module.exports = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Stripe sends raw body — Vercel needs this config (see vercel.json below)
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email;
    const subscriptionId = session.subscription;

    const licenseKey = generateLicenseKey();

    // TODO: Store in database (Neon/Supabase/simple KV)
    // await db.insert({ email: customerEmail, key: licenseKey, sub: subscriptionId });

    // Send key by email (see email section below)
    await sendLicenseEmail(customerEmail, licenseKey);

    console.log(`Issued key ${licenseKey} to ${customerEmail}`);
  }

  if (event.type === 'customer.subscription.deleted') {
    // TODO: Revoke license key in your database
    console.log('Subscription cancelled:', event.data.object.id);
  }

  res.json({ received: true });
};

async function sendLicenseEmail(email, key) {
  // Option A: Resend (easiest, free tier = 3,000 emails/month)
  // npm install resend
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: 'BibSure <noreply@kavihai.com>',
    to: email,
    subject: 'Your BibSure Scholar License Key',
    html: `
      <h2>Welcome to BibSure Scholar</h2>
      <p>Your license key:</p>
      <pre style="font-size:18px;letter-spacing:2px;padding:16px;background:#f5f5f5">${key}</pre>
      <h3>How to activate:</h3>
      <p><strong>VS Code:</strong> Settings → search "bibsure.licenseKey" → paste key</p>
      <p><strong>Zotero:</strong> Tools → BibSure → Enter License Key → paste key</p>
      <p><strong>Web app:</strong> Click "Activate" in the top bar → paste key</p>
      <p>Questions? Reply to this email.</p>
    `
  });
}
```

Add `vercel.json` at project root to pass raw body to webhook:

```json
{
  "functions": {
    "api/webhook.js": {
      "bodyParser": false
    }
  }
}
```

---

## Step 5 — Environment variables

In Vercel Dashboard → Project Settings → Environment Variables, add:

| Variable | Value | Where to find |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` | Stripe Dashboard → Developers → API Keys |
| `STRIPE_PRICE_MONTHLY` | `price_1Abc...` | Stripe Dashboard → Products → your product |
| `STRIPE_PRICE_ANNUAL` | `price_2Abc...` | Stripe Dashboard → Products → your product |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe Dashboard → Developers → Webhooks |
| `RESEND_API_KEY` | `re_...` | resend.com → API Keys |
| `SITE_URL` | `https://bibsure.kavihai.com` | Your domain |

For local testing, copy to `.env.local`:
```
STRIPE_SECRET_KEY=sk_test_...     ← use test keys locally
STRIPE_PRICE_MONTHLY=price_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
SITE_URL=http://localhost:3000
```

---

## Step 6 — Register the webhook in Stripe

1. Stripe Dashboard → Developers → Webhooks → **+ Add endpoint**
2. URL: `https://bibsure.kavihai.com/api/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Copy the **Signing secret** → set as `STRIPE_WEBHOOK_SECRET`

For local webhook testing:
```bash
npm install -g stripe
stripe login
stripe listen --forward-to localhost:3000/api/webhook
```

---

## Step 7 — Add pricing buttons to index.html

Add this to the pricing section on your site:

```html
<button onclick="checkout('monthly')">Subscribe $2/month</button>
<button onclick="checkout('annual')">Subscribe $20/year</button>

<script>
async function checkout(plan) {
  const priceId = plan === 'annual'
    ? 'price_ANNUAL_ID_HERE'
    : 'price_MONTHLY_ID_HERE';

  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId })
  });
  const { url, error } = await res.json();
  if (url) window.location.href = url;    // redirect to Stripe Checkout
  else alert('Error: ' + error);
}
</script>
```

---

## Step 8 — Success page

Create `success.html` — shown after payment:

```html
<!DOCTYPE html>
<html>
<head><title>BibSure — Payment Successful</title></head>
<body>
  <h1>You're all set!</h1>
  <p>Your license key has been emailed to you. Check your inbox (and spam folder).</p>
  <p><a href="/">Back to BibSure</a></p>
</body>
</html>
```

---

## Storing License Keys (Simple Option)

For a $2/month product with low initial volume, the simplest storage is
**Vercel KV (Upstash Redis)**:

```bash
# Install Upstash Redis via Vercel Marketplace
vercel integration add upstash
# Auto-provisions KV_REST_API_URL and KV_REST_API_TOKEN
```

```js
// In webhook.js — store the key
const { createClient } = require('@vercel/kv');  // or @upstash/redis
const kv = createClient();

// Store: key → { email, subscriptionId, active: true }
await kv.set(`license:${licenseKey}`, JSON.stringify({
  email: customerEmail,
  subscriptionId,
  active: true,
  createdAt: new Date().toISOString()
}));

// Validate: create api/validate-key.js
// POST { key } → { valid: true/false }
const data = await kv.get(`license:${key}`);
const valid = data && JSON.parse(data).active === true;
```

---

## Indian Payment Methods (important for Indian users)

Add UPI, NetBanking, etc. by enabling **Stripe India payment methods**:

```js
// In api/checkout.js — add payment_method_types:
payment_method_types: ['card', 'upi'],   // UPI works for INR
```

Or consider **Razorpay** as an alternative — better for Indian customers,
supports UPI natively, lower fees (2% vs Stripe's 3%+):
- Dashboard: https://dashboard.razorpay.com
- Same architecture — create order → redirect to hosted page → webhook

---

## Cost Breakdown

| Service | Cost | Notes |
|---|---|---|
| Stripe fees | 2.9% + $0.30 per transaction | ~$0.36 on $2 → you net $1.64 |
| Resend (email) | $0 | Free tier: 3,000 emails/month |
| Vercel KV | $0 | Free tier: 256MB |
| Vercel hosting | $0 | Free tier |
| **Total overhead** | **~18% of revenue** | Drops with volume |

At 100 subscribers × $2 = **$200/month gross → ~$164/month net**.
At 1,000 subscribers × $2 = **$2,000/month gross → ~$1,640/month net**.

---

## Go-Live Checklist

- [ ] Stripe account verified + bank account connected
- [ ] Product created with `price_*` IDs noted
- [ ] `api/checkout.js` deployed to Vercel
- [ ] `api/webhook.js` deployed to Vercel
- [ ] Webhook registered in Stripe Dashboard with correct events
- [ ] `STRIPE_WEBHOOK_SECRET` env var set in Vercel
- [ ] Resend account created, domain verified (kavihai.com)
- [ ] Test purchase with Stripe test card: `4242 4242 4242 4242`
- [ ] Confirm license key email arrives after test purchase
- [ ] Switch from `sk_test_` to `sk_live_` keys in production
- [ ] Pricing section on index.html links to `/api/checkout`
