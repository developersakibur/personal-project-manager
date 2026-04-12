# Project Manager Pro 🚀

**Project Manager Pro** is a high-performance, browser-based workspace designed specifically for premium freelancers and independent developers. It streamlines "mission" management, financial tracking, and productivity reporting with a sleek, cyber-industrial aesthetic.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Tech](https://img.shields.io/badge/stack-VanillaJS%20%7C%20CSS3%20%7C%20GAPI-orange)

## ✨ Core Features

### 🛠️ Mission Control
*   **Live Deadlines:** Real-time countdown timers for every project, color-coded by urgency (Red for < 72h, Yellow for < 50% time remaining).
*   **Status Management:** Track missions through three distinct phases: `Running`, `Revision`, and `Completed`.
*   **Quarterly Organization:** Automated grouping of projects by mission quarters (e.g., Q2 2026) for long-term tracking.

### 💰 Financial Insights
*   **Value Tracking:** Monitor gross project values and individual shares.
*   **Transfer Status:** Toggle "Pending" vs "Done" for payments to maintain a clear cash-flow overview.
*   **Performance Stats:** Integrated "Insights Panel" showing total earnings and completion rates.

### ☁️ Cloud Synchronization
*   **Google Drive Integration:** Seamlessly sync your data across devices using the Google Drive API.
*   **Local-First Architecture:** Instant loading from `localStorage` with background cloud syncing to ensure zero latency.

### 📊 Reporting & Export
*   **Image Capture:** Generate and download "Today Tasks" reports as images using `html2canvas` for quick sharing or archiving.
*   **Data Portability:** Full support for JSON-based import/export to ensure you always own your data.

## 🛠️ Technical Stack

*   **Frontend:** Vanilla JavaScript (ES6+ Modules)
*   **Styling:** Modular CSS3 (Variables, Flexbox, Grid)
*   **Authentication:** Google Identity Services (GIS)
*   **Database/Sync:** Google Drive API (GAPI)
*   **Utilities:** `html2canvas` (for report generation)

## 📂 Project Structure

```text
├── index.html          # Core layout and entry point
├── css/
│   ├── base.css        # Global variables and resets
│   └── modules/        # Component-specific styles (Dashboard, Modal, Stats)
└── js/
    ├── app.js          # App initialization and event orchestration
    └── modules/
        ├── actions.js  # Business logic and user interactions
        ├── auth.js     # GSI/GAPI authentication flow
        ├── drive.js    # Google Drive CRUD operations
        ├── state.js    # Centralized state management
        └── ui.js       # Dynamic DOM rendering engine
```

## 🚀 Getting Started

### Prerequisites
1.  **Google Cloud Project:** Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2.  **Enable APIs:** Enable the **Google Drive API** and **Google Picker API**.
3.  **Credentials:** Create an OAuth 2.0 Client ID for a "Web Application".
4.  **Authorized Origins:** Add your local/production URL (e.g., `http://localhost:5500`) to the authorized JavaScript origins.

### Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/personal-project-manager.git
    ```
2.  Open `index.html` via a local server (e.g., VS Code Live Server).
3.  Sign in with your Google account to enable cloud sync.

## 🛡️ Security & Privacy
Project Manager Pro is a **client-side only** application. Your project data is stored only in your local browser storage and your private Google Drive folder. No data is ever sent to third-party servers.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
