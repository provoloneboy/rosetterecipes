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
- `firebase-config.js`: your Firebase credentials (fill this in)

## 1. Firebase setup

Create a Firebase project at <https://console.firebase.google.com> and then:

1. Create a Web app in that project.
2. Enable Authentication:
   - `Authentication` -> `Sign-in method` -> enable `Email/Password`.
3. Enable Firestore Database:
   - `Firestore Database` -> create database (production mode is fine).
4. Copy your Firebase web config values into `firebase-config.js`.

Example `firebase-config.js`:

```js
export const FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

## 2. Firestore security rules

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

## 3. Run locally

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## 4. Publish for your wife to use anywhere

Deploy on GitHub Pages (or Firebase Hosting).

### GitHub Pages

1. Push this project to GitHub.
2. Repo -> `Settings` -> `Pages`.
3. Source: `Deploy from a branch`.
4. Branch: `main`, folder `/ (root)`.
5. Save and open the generated URL.

## Notes

- URL extraction uses `r.jina.ai` as a lightweight text mirror for recipe/blog pages.
- OCR uses `tesseract.js` via CDN.
- Parsing is heuristic-based; some recipes may still need minor cleanup.
