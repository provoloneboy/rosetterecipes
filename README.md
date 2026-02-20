# Rosette Recipes

Rosette Recipes is a static web app with cloud sync, login, recipe extraction, and categorization.

## Features

- Import recipes from:
  - Website URL (best-effort extraction)
  - Pasted text/blog content
  - Photos/screenshots (OCR in browser)
- Scale ingredient amounts by servings
- Convert unit display (Original / Metric / US)
- Category management in a dedicated `Categories` tab
- Assign category per recipe
- Email/password login and cloud sync using Firebase

## Project files

- `index.html`: layout + auth + import + recipe viewer + tabs
- `styles.css`: visual style and responsive behavior
- `app.js`: Firebase auth/data sync + extraction + recipe tools
- `firebase-config.json`: placeholder runtime config (safe placeholder only)
- `.github/workflows/pages.yml`: deploy pipeline that injects Firebase secrets

## 1. Firebase setup

Create a Firebase project at <https://console.firebase.google.com> and then:

1. Create a Web app in that project.
2. Enable Authentication:
   - `Authentication` -> `Sign-in method` -> enable `Email/Password`.
3. Enable Firestore Database:
   - `Firestore Database` -> create database (production mode is fine).
4. Add `provoloneboy.github.io` to `Authentication` -> `Settings` -> `Authorized domains`.

## 2. Local config (not committed)

Create `/Users/andrewrobinson/Documents/New project/firebase-config.local.json`:

```json
{
  "apiKey": "...",
  "authDomain": "...",
  "projectId": "...",
  "storageBucket": "...",
  "messagingSenderId": "...",
  "appId": "..."
}
```

`firebase-config.local.json` is in `.gitignore`, so it stays off GitHub.

## 3. Firestore security rules

In Firebase Console -> `Firestore Database` -> `Rules`, use:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /recipes/{recipeId} {
      allow read, create: if request.auth != null && request.auth.uid == request.resource.data.uid;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.uid;
    }

    match /categories/{categoryId} {
      allow read, create: if request.auth != null && request.auth.uid == request.resource.data.uid;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.uid;
    }
  }
}
```

## 4. Run locally

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## 5. Deploy with GitHub Secrets (no keys in repo)

In GitHub repo -> `Settings` -> `Secrets and variables` -> `Actions`, add:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Then in repo -> `Settings` -> `Pages`:

1. Source: `GitHub Actions`
2. Push to `main` (or run workflow manually)
3. Workflow writes `firebase-config.json` at build time and deploys to Pages

## Notes

- URL extraction uses `r.jina.ai` as a lightweight text mirror for recipe/blog pages.
- OCR uses `tesseract.js` via CDN.
- Parsing is heuristic-based; some recipes may still need minor cleanup.
