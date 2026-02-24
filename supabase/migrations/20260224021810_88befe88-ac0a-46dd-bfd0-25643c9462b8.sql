
-- Enable pg_cron and pg_net for the stuck-sending cleanup job
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create the cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_stuck_sending()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT qr.id, qr.study_id, qr.vendor_id, s.user_id
    FROM quotation_requests qr
    JOIN studies s ON s.id = qr.study_id
    WHERE qr.status = 'sending'
      AND qr.sent_at IS NULL
      AND qr.last_attempt_at < now() - interval '10 minutes'
    FOR UPDATE OF qr
  LOOP
    UPDATE quotation_requests
    SET status = 'failed',
        error_code = 'STUCK_SENDING',
        last_attempt_at = now()
    WHERE id = v_rec.id;

    INSERT INTO email_send_log (user_id, study_id, vendor_id, request_id, event_type, error_code)
    VALUES (v_rec.user_id, v_rec.study_id, v_rec.vendor_id, v_rec.id, 'stuck_cleaned', 'STUCK_SENDING');
  END LOOP;
END;
$$;
