# Homework Help AI web frontend — OpenAI edition

React client for [Homework Help AI](https://github.com/zhangboz/homework-help-ai): upload homework images/PDFs, display Markdown/math/code answers, play AI-generated WAV speech, and download PDF/DOCX documents. The separate WeChat `frontend/` project is preserved unchanged. Parent-project/deployment links require access to the private repository.

## Status — 2026-11-04

The **new Render static site + Render Free API + Neon Free PostgreSQL** route is deployed for testing at [synapse-openai-web.onrender.com](https://synapse-openai-web.onrender.com). Homepage, JavaScript bundle, API configuration, CORS and SPA fallback passed HTTPS checks. Database restoration is verified. The custom website domain has not been switched. The retired Render system remains archived; Oracle is paused after unavailable Phoenix capacity, with no VM created. GCS textbook upload and cloud transcription remain paused.

The backend uses `gpt-6.1-terra` for homework, transcription and hosted document formatting, and `gpt-realtime-2.1-mini` for speech. The existing `gpt-6-luna` selected-concept feature is preserved in the working tree. Email/Google login and Stripe TEST remain available; valid `active` or `trialing` subscriptions grant premium features. Live charges are not enabled.

See the [backend repository](https://github.com/zhangboz/backend) and [Render + Neon deployment guide](https://github.com/zhangboz/homework-help-ai/blob/codex/render-neon-free/deploy/render/README.md).

## User flows

1. Upload/capture an image or select a PDF, preview it and submit.
2. Display the answer and spoken explanation text. If the second step fails, keep the answer and show a warning.
3. Request AI-generated speech and play the WAV; an audio failure leaves the answer intact.
4. Create a PDF or Word job, poll for up to ten minutes, and use its signed download link. Pending exports survive a page refresh through `sessionStorage` and resume with the original request key/job ID. A transient status failure does not silently create another paid export.
5. Select text in a newly generated answer for **ChatGPT explain**. The existing concept flow allows an initial explanation and one follow-up, then offers context export. API restart/expiry clears its in-memory question context, so old results may need regeneration.

The current result flow is saved in `sessionStorage`. Export status, ownership and bytes live in backend PostgreSQL and survive API restarts. Download links expire after 15 minutes; backend file retention is one hour. The cloud Word sample contained native math; other model runs may use equation images. Exports no longer require a local converter or worker.

## Local development

Use Node 24 LTS. In the full checkout:

```powershell
# web_frontend
npm ci
# sibling backend
cd ../backend
npm ci
npm run local:backup
npm run db:migrate
npm run local:start
npm run local:check
```

The launcher runs only API + React. Docker, Redis and Pandoc are unnecessary. Alternatively run `npm start` here after starting the API separately.

The ignored frontend `.env.local` contains public configuration only:

```dotenv
REACT_APP_BACKEND_URL=http://localhost:5000
REACT_APP_GOOGLE_CLIENT_ID=your_public_google_client_id
```

Open [localhost:3000](http://localhost:3000). Google OAuth returns to `/api/login/auth/google/callback` on the backend origin. Rebuild when `REACT_APP_BACKEND_URL` changes because Create React App embeds it at build time.

Never place OpenAI keys, Stripe secret keys, mail credentials, database URLs or Google client secrets in frontend configuration. They belong only in the backend; the Google client ID is public.

## Build and deployment

```powershell
npm test -- --watchAll=false --runInBand
npm run build
```

The new root Blueprint serves `build/` as a Render static site with an SPA rewrite to `/index.html`; it does not publish the React development server. The API is a separate origin. Keep the configured backend URL and backend CORS/frontend URL consistent. Free API cold starts can delay the first request; the static frontend remains separately hosted. See [Render Free behavior](https://render.com/docs/free).

The deployed production build serves the new API origin. Actual cloud API tests passed existing-account login, image homework, speech, PDF/DOCX and Stripe TEST transitions. The owner confirmed Google login and the complete new-email registration flow: receipt, confirmation link and password login. Resend's sender domain is verified and mail configuration is deployed. Hosted Checkout remains a separate browser acceptance step; see the deployment guide.

## Main code paths

- `src/App.js`: routing, requests, authentication and subscription state.
- `src/components/ResultsPage.js`: answer rendering, speech and export lifecycle.
- `src/components/ConceptExplanation.js`: preserved selected-concept interaction.
- `src/components/AccountPage.js`: account and Stripe TEST actions.
- `src/components/AdminPage/`: authorized data views and paused textbook upload.
- `src/utils/`: subscription access and export-state helpers.

The UI uses React Router, Create React App, `react-markdown`, `remark-math`, `rehype-katex` and `react-syntax-highlighter`. Preserve its responsive mobile layout.

Candidate validation: all 31 React tests and `npm run build` passed. Deployment uses the dedicated `codex/render-neon-free` branch; publishing it does not update the old master-based Render site.
