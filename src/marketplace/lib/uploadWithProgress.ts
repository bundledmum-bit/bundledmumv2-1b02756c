import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Upload a file to a Supabase Storage bucket with real, byte-level progress.
 * No progress-reporting mechanism exists anywhere else in this codebase
 * (dispatch photos and payout proofs both just show a "Saving..." spinner,
 * since a small compressed JPEG uploads in under a second) — this is new,
 * because a raw, uncompressed phone video on Nigerian mobile data can take
 * minutes, and a silent spinner for that long reads as frozen.
 *
 * supabase-js's own `.storage.from(bucket).upload()` uses fetch() under the
 * hood, which has no upload-progress event in browsers. The only way to get
 * a real percentage is a raw XMLHttpRequest, so this generates a one-time
 * signed upload URL via the SDK (createSignedUploadUrl, no hand-rolled
 * signing) and then PUTs the file to it directly via XHR, replicating
 * exactly what the SDK's own uploadToSignedUrl does on the wire (a
 * multipart form with a "cacheControl" field and the file under an empty
 * field name) so the request is byte-for-byte what Supabase expects, just
 * with upload.onprogress wired up.
 *
 * Uploads the file exactly as given — no compression, no re-encoding, no
 * canvas, no video element of any kind. Whatever File is passed in is
 * whatever bytes leave the browser.
 */
export function uploadWithProgress(
  client: SupabaseClient,
  bucket: string,
  path: string,
  file: File | Blob,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.storage.from(bucket).createSignedUploadUrl(path).then(({ data, error }) => {
      if (error || !data) { reject(error || new Error("Could not start the upload.")); return; }

      const xhr = new XMLHttpRequest();
      xhr.open("PUT", data.signedUrl);
      xhr.setRequestHeader("x-upsert", "false");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(); }
        else reject(new Error(`Upload failed (${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error("The upload failed, please check your connection and try again."));
      xhr.onabort = () => reject(new Error("Upload cancelled."));

      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      xhr.send(form);
    }, reject);
  });
}
