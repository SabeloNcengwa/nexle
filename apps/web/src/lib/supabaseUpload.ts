import { apiFetch } from './api';

interface SignedUpload {
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
  contentType: string;
}

/** Request a Supabase signed upload URL from the API, then PUT the file. */
export async function uploadViaSignedUrl(
  path: string,
  file: Blob,
  contentType: string,
): Promise<{ path: string; bucket: string }> {
  const signed = await apiFetch<SignedUpload>('/v1/uploads/sign', {
    method: 'POST',
    body: JSON.stringify({ path, contentType, upsert: true }),
  });

  const res = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: file,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Upload failed (${res.status})`);
  }

  return { path: signed.path, bucket: signed.bucket };
}
