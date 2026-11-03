# Supabase setup (database + uploads)

NEXLE keeps **Firebase Auth** for sign-in. **Postgres + Storage** live on Supabase project [`sttgjxiyyyanfvynrqfb`](https://supabase.com/dashboard/project/sttgjxiyyyanfvynrqfb).

## 1. Apply the schema

In the Supabase SQL editor (or CLI), run:

[`supabase/migrations/20261103140000_init_nexle.sql`](../supabase/migrations/20261103140000_init_nexle.sql)

This creates document tables for every former Firestore collection, enables RLS (API uses the service role / DB URL), and ensures Storage buckets:

| Bucket | Public | Use |
|--------|--------|-----|
| `seller-docs` | no | KYC / signed merchant contracts |
| `product-images` | yes | Product cover images |

## 2. API environment

From **Project Settings → API** and **Database**:

```env
SUPABASE_URL=https://sttgjxiyyyanfvynrqfb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...          # server only
SUPABASE_DB_URL=postgresql://...       # connection string (pooler OK)
```

Never commit the service role key or DB password.

## 3. Web environment

```env
VITE_SUPABASE_URL=https://sttgjxiyyyanfvynrqfb.supabase.co
VITE_SUPABASE_ANON_KEY=...             # optional; uploads use API signed URLs
```

Seller Centre uploads call `POST /v1/uploads/sign`, then PUT the file to the signed URL. Paths stay:

- `sellerApplications/{applicationId}/docs/{uid}/{kind}_{file}`
- `sellers/{sellerId}/products/{productId}/{file}`

## 4. Seed commission plan

After the schema is applied and env is set:

```bash
npm run ensure:commission -w @mavundla/api
```

## 5. Auth reminder

Firebase Auth authorized domains and `GOOGLE_APPLICATION_CREDENTIALS` (or the Auth emulator) are still required for API token verification. Firestore/Storage emulators are no longer used for app data.
