-- Allow authenticated users to upload to the music bucket
CREATE POLICY "Authenticated users can upload music"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'music');

-- Allow public read access to music files
CREATE POLICY "Public can read music files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'music');

-- Allow users to delete their own music files
CREATE POLICY "Users can delete own music files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'music' AND (storage.foldername(name))[1] = auth.uid()::text);