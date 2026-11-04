# Homework Help AI web frontend — OpenAI edition

React web client for [Homework Help AI](https://github.com/zhangboz/homework-help-ai). It sends homework images/PDFs and handwriting to the backend, displays Markdown, mathematics and code, plays AI-generated speech, and downloads PDF/DOCX exports. The separate WeChat `frontend/` project is preserved and is outside this web migration.

The parent project and Oracle deployment guide are in a private repository; their links require an authorized GitHub account. This component repository remains independently usable.

## Current status — 2026-11-04

- The active backend uses OpenAI: two `gpt-6.1-terra` Responses calls for answers and spoken explanation text, a single call for handwriting transcription, and `gpt-realtime-2.1-mini` for WAV speech.
- Local email/Google login and Stripe TEST subscription flows are restored. Valid `active` or `trialing` subscriptions grant premium access.
- Oracle deployment is **under testing**, with SSH-only private preview configuration. Local Linux tests passed; Phoenix Always Free capacity is currently unavailable, no VM has been provisioned, and actual ARM64/cloud checks remain pending.
- The old Render system is **archived and inactive**. This update does not re-enable it or switch the existing domain/DNS.
- GCS textbook upload and cloud transcription are paused. The admin page reflects the pause; historical database records remain available to authorized administrators.

See the [project setup and status](https://github.com/zhangboz/homework-help-ai/blob/main/README.md), [backend repository](https://github.com/zhangboz/backend), and [Oracle deployment guide](https://github.com/zhangboz/homework-help-ai/blob/main/deploy/oracle/README.md).

## User flows

1. Upload or capture an image, or choose a PDF; preview and submit it.
2. Display the returned answer and explanation with Markdown, KaTeX and syntax highlighting. If explanation generation fails, retain the answer and show the warning.
3. Request AI-generated speech through the backend and play the returned WAV. Speech failure leaves the answer intact.
4. Queue a PDF or Word export, poll its status, then use the signed download link. Show the backend's safe error explanation on failure and allow retry; expire completed links after the returned deadline.

The app preserves the current result flow in `sessionStorage`. Email login, email confirmation and Google OAuth remain available independently of the retired Google AI services. Subscription cancellation and resumption use Stripe TEST endpoints; live charges are not enabled.

## Local development

Use the complete project checkout when starting the entire stack through `backend` scripts:

```powershell
# In web_frontend
npm ci

# Change to the sibling backend directory
cd ../backend
npm ci
npm run local:start
npm run local:check
```

Alternatively, run this web client separately after starting the backend:

```powershell
npm ci
npm start
```

Create an ignored `.env.local` file for public frontend configuration:

```dotenv
REACT_APP_BACKEND_URL=http://localhost:5000
REACT_APP_GOOGLE_CLIENT_ID=your_public_google_client_id
```

Open [localhost:3000](http://localhost:3000). The backend defaults to `http://localhost:5000`; its Google OAuth callback is `/api/login/auth/google/callback` on the backend origin. Frontend environment values are embedded at build time, so rebuild when the deployed backend URL changes.

**Never put `OPENAI_API_KEY`, Stripe secret keys, SMTP passwords or Google client secrets in this repository's environment or browser bundle.** They belong only in the backend. The Google client ID above is public configuration.

## Validation and builds

```powershell
npm test -- --watchAll=false --runInBand
npm run build
```

Production serves the generated `build/` assets through a web server. The Oracle configuration uses Caddy to serve those assets and proxy `/api/*`; it does not publish the React development server. Public release remains blocked on actual ARM64/cloud validation and complete backend TeX filesystem isolation. Keep the current Oracle preview private as described in its deployment guide.

## Main code paths

- `src/App.js`: routing, request flow, authentication and subscription state.
- `src/components/ResultsPage.js`: Markdown/math/code rendering, speech playback and export job lifecycle.
- `src/components/AccountPage.js`: account and Stripe TEST subscription actions.
- `src/components/AdminPage/`: authorized database views and the paused textbook-upload notice.
- `src/utils/`: shared subscription access rules.

The UI uses React, React Router, Create React App, `react-markdown`, `remark-math`, `rehype-katex`, and `react-syntax-highlighter`. Retain the responsive mobile layout when changing these flows.
