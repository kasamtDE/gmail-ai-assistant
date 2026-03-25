# 📧 Gmail AI Assistant

AI-powered Gmail monitoring that identifies commercially important threads you haven't replied to, and delivers a concise daily digest with priorities, risk assessments, and draft replies.

**Powered by**: Gmail API · Gemini API · SQLite · Node.js

---

## Features

- 🔍 **Smart Filtering** — Skips mass-marketing, newsletters, spam; surfaces business-critical threads
- 🧠 **AI Analysis** — Gemini assigns priority, explains risk, suggests actions, drafts replies
- 📊 **Daily Digest** — Clean summary delivered via Slack and/or email (fully configurable max items)
- 🔄 **Deduplication** — Won't resurface threads you've already seen
- ⚙️ **Configurable** — Tune filters, schedules, model selection, and delivery channels
- 🚫 **No auto-sending** — Draft replies are suggestions only

---

## Quick Start

### 1. Prerequisites

- **Node.js 18+**
- **Google Cloud Project** with Gmail API enabled
- **Gemini API Key** (free at [aistudio.google.com](https://aistudio.google.com/apikey))
- **Slack Webhook** (optional) or **SMTP credentials** for email delivery

### 2. Google Cloud Setup (Gmail API)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Gmail API**: APIs & Services → Library → search "Gmail API" → Enable
4. Create **OAuth 2.0 credentials**:
   - APIs & Services → Credentials → Create Credentials → OAuth Client ID
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/oauth2callback`
5. Download the credentials and note the **Client ID** and **Client Secret**

### 3. Install & Configure

```bash
# Clone/navigate to project directory
cd "automation ai"

# Install dependencies
npm install

# Create your environment file
cp .env.example .env
```

Edit `.env` with your credentials. You can use either the free AI Studio API or Google Cloud's Enterprise Vertex AI:

```env
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret

# AI PROVIDER (Choose A or B)
# Option A: Standard Google AI Studio (Free/Paid Tier)
GEMINI_API_KEY=your_gemini_key

# Option B: Enterprise Vertex AI
VERTEX_PROJECT_ID=your_gcp_project_id
VERTEX_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# DELIVERY AUTHORIZATION
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
# OR
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_app_password
DIGEST_TO_EMAIL=you@gmail.com
```

### 4. Authenticate with Gmail

```bash
npm run setup
```

This opens a browser window for Google OAuth. After authorizing, a `token.json` file is saved locally.

### 5. Run

```bash
# Run once now (manual trigger)
npm run digest

# Run on schedule (9 AM + 5 PM by default)
npm start
```

---

## Configuration

Edit `config.json` to customize:

| Setting | Default | Description |
|---------|---------|-------------|
| `digest.schedule` | `["0 9 * * *", "0 17 * * *"]` | Cron expressions for digest times |
| `digest.maxItems` | `50` | Max threads per digest |
| `digest.delivery` | `["slack", "email"]` | Delivery channels |
| `digest.timezone` | `Europe/London` | Your timezone |
| `gmail.lookbackHours` | `72` | How far back to scan |
| `gmail.maxThreads` | `50` | Max threads to fetch per scan |
| `filter.ignoredDomains` | *(see config.json)* | Domains to always skip |
| `filter.ignoredSenderPatterns` | *(see config.json)* | Sender patterns to skip |
| `filter.ignoreNewsletters` | `false` | Set to `true` to blindly block all mass-marketing emails and save AI quota. Keep `false` if tracking job applications via platforms like Indeed or Upwork. |
| `businessContext.*` | *(see config.json)* | Your Name/Company/Industry to contextualize the AI |
| `gemini.model` | `""` | Leave empty to auto-select the best model depending on your API (`gemini-3.1-flash-lite-preview` or `gemini-2.5-flash-lite`). Add a string to enforce a specific model. |

---

## Architecture

```
Gmail API → Fetch threads → Filter noise → Gemini BI Analysis → Digest → Slack/Email
                                                     ↕
                                               SQLite (state)
```

| File | Purpose |
|------|---------|
| `src/auth.js` | OAuth2 setup and token management |
| `src/gmail.js` | Gmail API: fetches full threads and base64url decodes the body |
| `src/filter.js` | Noise removal, Mass-Marketing block, and thread evaluation |
| `src/analyzer.js` | Advanced Business Intelligence prompt and cross-SDK inference |
| `src/db.js` | SQLite state tracking and deduplication |
| `src/digest.js` | Email & Slack aesthetic rendering and grouping |
| `src/index.js` | Pipeline orchestration and cron scheduler |
| `src/config.js` | Config file loader |
| `config.json` | All tunable settings |

---

## Digest Output Example

```
🔴 [High] Missing documents for insurance claim
   From: cliams@allianz.com (Vendor - 16h ago)
   ⏱  Deadline: 2026-03-24 (Urgent request for missing documents)
   💰 Financial: Insurance claim for medical expenses abroad.
   Why: Crucial for processing an ongoing medical insurance claim
   Risk: The insurance claim will not be processed, resulting in financial loss
   Action: Gather and send the requested documents immediately.
   Draft: I am working on gathering the requested documents for my claim...

🟡 [Medium] Upwork Invitation: Voice Actors for TTS Project
   From: donotreply@upwork.com (Client - 17h ago)
   ⏱  Deadline: 2026-03-25 (Clients prefer responses within 24 hours.)
   📈 Opportunity: New Lead
   💰 Financial: Fixed Price, Estimated Budget $200.00
   Why: Opportunity for freelance voice acting work
   Risk: Missed opportunity to bid on the project
   Action: Review the job details and submit a proposal if interested
   Draft: Thank you for the invitation. I will review the job details and...
```
