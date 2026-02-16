
-- Drop existing permissive storage policies
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;

-- Upload: verify path starts with study_id user owns
CREATE POLICY "Users upload to own studies"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM public.studies 
    WHERE user_id = auth.uid() AND is_deleted = false
  )
);

-- Read: verify path starts with study_id user owns
CREATE POLICY "Users read own study documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM public.studies 
    WHERE user_id = auth.uid() AND is_deleted = false
  )
);

-- Delete: verify path starts with study_id user owns
CREATE POLICY "Users delete own study documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM public.studies 
    WHERE user_id = auth.uid() AND is_deleted = false
  )
);
