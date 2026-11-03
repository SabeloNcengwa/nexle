# Firebase cloud project (Nexle)

**Project:** [nexle-marketplace](https://console.firebase.google.com/project/nexle-marketplace/overview)  
**Region (Firestore):** `africa-south1`

## Done by engineering

- Project + web app created  
- Web SDK config written to `apps/web/.env` (gitignored)  
- Emulator hosts removed from API/web env  
- Firestore `(default)` created; rules + indexes deployed  
- Admin SDK service account `nexle-api@…` key in `secrets/nexle-marketplace-admin.json` (gitignored)  
- `.firebaserc` → `nexle-marketplace`

## You must click once in the console

### 1. Authentication (required for login/register)

1. Open [Authentication](https://console.firebase.google.com/project/nexle-marketplace/authentication)  
2. Click **Get started** if shown  
3. **Sign-in method** → enable **Email/Password** → Save  

Until this is done, sign-up returns `CONFIGURATION_NOT_FOUND`.

### 2. Storage (optional until image uploads)

Spark plan blocks Storage until you upgrade to **Blaze** (pay-as-you-go; free tier still applies).  

[Storage](https://console.firebase.google.com/project/nexle-marketplace/storage) → **Upgrade project** → Get started.

Catalogue without seller image uploads can run on Auth + Firestore alone.

## Local run (cloud)

```bash
# No emulators required
npm run dev:api
npm run dev:web
```

Confirm `VITE_USE_EMULATORS=false` and no `*_EMULATOR_HOST` in `apps/api/.env`.
