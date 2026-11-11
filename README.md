# Halves

Ad-free expense splitting for two. GitHub Pages hosts the app; Supabase (free tier) stores the data and syncs it live between both phones.

## 1. Set up the database (Supabase, ~10 min)

1. Go to [supabase.com](https://supabase.com), sign up, and create a **New project** (Free plan). Pick the region closest to you. Save the database password somewhere safe, although the app never uses it.
2. When the project is ready, open **SQL Editor → New query**, paste in the whole of `schema.sql`, and click **Run**. It should say "Success".
3. Open **Authentication → Users → Add user → Create new user**:
   - Enter your email and a password, and tick **Auto Confirm User**.
   - Repeat for your wife's email.
4. Open **Authentication → Sign In / Providers** and switch off **Allow new users to sign up**. After that, only the two of you can ever sign in.
5. Open **Project Settings → API** (or **API Keys**) and copy:
   - the **Project URL**
   - the **anon / public** key (on newer projects it's under *Legacy API keys*, or use the *publishable* key)

## 2. Add your keys

Open `config.js` and replace the two placeholders:

```js
window.HALVES_CONFIG = {
  SUPABASE_URL: 'https://abcdxyz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
};
```

The anon key is meant to be public, so it's safe in a public repo. Your data is protected by sign-in plus the row-level security rules in `schema.sql`.

## 3. Put it on GitHub Pages

1. On GitHub, go to **New repository**, name it `halves`, and make it **Public**. (Pages on a private repo needs a paid plan.)
2. Click **uploading an existing file** and drag in everything from this folder, including the `icons` folder. Then commit.
3. Open **Settings → Pages → Build and deployment**, set Source to **Deploy from a branch**, choose **main** and **/ (root)**, and save.
4. After about a minute the app is live at `https://YOUR-USERNAME.github.io/halves/`.

## 4. Install on both phones

1. Open the link on each phone and sign in.
2. Each of you enters a display name the first time.
3. Add it to your home screen:
   - **iPhone:** Safari → Share → Add to Home Screen
   - **Android:** Chrome → ⋮ → Add to Home screen

## How updates work

- **Data:** anything either of you adds, edits or deletes appears on the other phone within a second or two while the app is open, and refreshes whenever it's reopened.
- **App changes:** edit the files on GitHub and commit. Pages redeploys in about a minute, and both phones pick up the new version the next time the app is fully closed and reopened.

## Things to know

- **Free Supabase projects pause after 7 days with no activity.** With regular use this won't happen. If it does, open the Supabase dashboard and click **Restore project**, and no data is lost.
- **Export CSV** (in the ⋯ menu) downloads everything as a spreadsheet for backup.
- **Categories:** to change them, edit the `CATEGORIES` list at the top of `app.js`. Old entries keep their category id, and an unknown id shows as "Other".
- Running `schema.sql` a second time will error on the last line (realtime is already enabled). That's harmless.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Look and feel (light + dark mode) |
| `app.js` | All app logic |
| `config.js` | Your Supabase URL + key |
| `schema.sql` | Database tables, security rules, live sync |
| `manifest.webmanifest`, `icons/` | Home-screen install |
