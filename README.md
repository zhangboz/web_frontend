# AI Homework Helper - Frontend

This repository contains the React frontend for the AI Homework Helper application. The app is designed to assist students by analyzing images of homework problems and providing detailed, formatted explanations using AI.

## 🎯 Design Philosophy

### 1. "Native-App" Experience on the Web
Although this is a web application, the UI/UX is built with a **mobile-first** approach. The goal is to replicate the feel of a native mobile application when accessed via a mobile browser.
*   **Sticky Navigation:** Bottom navigation bars and top headers are positioned to mimic iOS/Android app layouts.
*   **Responsive CSS:** The layout adapts seamlessly between desktop and mobile, but the mobile view is the primary design target.
*   **Interaction:** Touch targets and scroll behaviors are optimized for handheld use.

### 2. Math & Code as First-Class Citizens
Since the target audience is students (STEM focus), text rendering is the most critical part of the application. The `ResultsPage.js` is heavily engineered to handle complex data formats:
*   **Markdown:** For general structure.
*   **LaTeX:** For precise mathematical formula rendering (via `KaTeX`).
*   **Syntax Highlighting:** For coding homework snippets.

---

## 🚀 Key Features & Workflows

### 1. The Core User Loop
The application is state-driven (managed in `App.js`) and follows a strict linear flow:
1.  **Input:** User captures or uploads a photo of a problem.
2.  **Preview:** User confirms quality (`PreviewPage`).
3.  **Processing:** The app enters a polling/waiting state while the backend processes the image (`WaitingPage`).
4.  **Result:** The AI response is streamed or displayed (`ResultsPage`).

### 2. The Results Engine (`ResultsPage.js`)
This is the most complex component in the codebase. It parses the raw string response from the backend and renders it using a specific stack of libraries:
*   `react-markdown`
*   `remark-math` & `rehype-katex` (for LaTeX/Math)
*   `react-syntax-highlighter` (for code blocks)
*   **Audio Generation:** It also handles text-to-speech requests for auditory explanations.
*   **Exporting:** Includes logic to export the rendered result to PDF or Word.

### 3. Authentication & State
*   **Google OAuth:** integrated for seamless sign-in.
*   **Session Resilience:** The app uses `sessionStorage` snapshots to save the application flow. If a user refreshes the page on the "Results" screen, the app restores the state rather than booting them back to the home screen.

---

## 🛠️ Admin Portal & RAG Architecture (WIP)

> ⚠️ **Note:** The Admin features are currently located at `/admin` and are accessible via `AdminPage/index.js`.

The Admin Portal is an internal tool designed to power the **RAG (Retrieval-Augmented Generation)** capabilities of the backend. To increase answer accuracy, we use this portal to ingest "truthful" academic content.

### Components:
*   **FileUploader.js:** Allows uploading of raw PDF textbooks, lecture slides, and notes. It attaches metadata (Institution, Course Code, Professor) and sends them to Google Cloud Storage via the backend.
*   **DbViewer.js:** A dashboard to view the state of the SQL database and the vector embeddings generated from the uploaded files.

### Future Roadmap for Admin
*   **Decoupling:** Currently, the Admin portal lives within the main consumer web app. For security purposes (DNS separation and access control), the plan is to move this logic to a separate repository/subdomain in the future.

---

## 💻 Technical Stack

*   **Framework:** React (Create React App)
*   **Routing:** React Router v6
*   **Styling:** Pure CSS (Responsive, Mobile-first)
*   **Math Rendering:** KaTeX
*   **State Management:** React Hooks (`useState`, `useEffect`, `useCallback`)
*   **Build Tool:** Webpack (via CRA)

---

## ⚙️ Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/your-repo.git
    cd your-repo
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the root directory. You will need the following keys:
    ```env
    REACT_APP_BACKEND_URL=http://localhost:5000
    REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id
    ```

4.  **Run the development server:**
    ```bash
    npm start
    ```
    Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

---

## 📂 Project Structure Overview

```text
src/
├── App.js              # Main State Machine & Routing Logic
├── App.css             # Global & Layout Styles
├── components/
│   ├── HomePage.js     # Mode selection (Homework vs Notes)
│   ├── ResultsPage.js  # The core rendering engine (Markdown/Latex)
│   ├── AdminPage/      # RAG Data Entry Tools (WIP)
│   │   ├── FileUploader.js
│   │   ├── DbViewer.js
│   │   └── index.js
│   ├── BottomNav.js    # Mobile-style navigation
│   └── ... (Auth, Waiting, Preview pages)
└── index.js            # Entry point
```

## 🤝 Contribution Guidelines

*   **CSS:** When modifying styles, please test on a mobile viewport (Chrome DevTools Mobile Simulator) to ensure the "native app" feel is preserved.
*   **Admin Tools:** If working on `AdminPage`, please coordinate regarding the API endpoints, as this section is actively evolving to support the Vector Database backend.