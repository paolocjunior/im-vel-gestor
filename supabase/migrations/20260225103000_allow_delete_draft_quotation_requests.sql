-- Allow authenticated users to delete only their own draft quotation requests.
-- Items are deleted by FK cascade (quotation_request_items.request_id -> quotation_requests.id).

GRANT DELETE ON TABLE public.quotation_requests TO authenticated;

DROP POLICY IF EXISTS qr_delete_draft_own ON public.quotation_requests;
CREATE POLICY qr_delete_draft_own
ON public.quotation_requests
FOR DELETE
TO authenticated
USING (public.owns_study(study_id) AND status = 'draft');

