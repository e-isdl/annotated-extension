-- 2026-09-29: Allow signed-in uploads into the public "clips" bucket.
--
-- The bucket had no object policies at all, so every INSERT was denied.
-- That blocked podcast recording uploads (path clips/podcasts/<uid>/...) and
-- would block the new X tweet screenshot thumbnails (path clips/thumbs/<uid>/...).
--
-- Policy: authenticated users may insert objects whose third path segment is
-- their own user id. Reads stay on the bucket's public flag (public URLs).

create policy "Authenticated users can upload clip media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'clips'
  and (storage.foldername(name))[3] = auth.uid()::text
);
