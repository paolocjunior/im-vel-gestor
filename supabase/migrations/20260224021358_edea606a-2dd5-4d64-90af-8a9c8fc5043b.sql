
-- ============================================================
-- MIGRATION vFinal.6: send-quotation-email infrastructure
-- ============================================================

-- 2.1 Alterar quotation_requests
ALTER TABLE public.quotation_requests
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS send_key uuid;

-- 2.2 Constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotation_requests_attempt_count_nonneg'
  ) THEN
    ALTER TABLE public.quotation_requests
      ADD CONSTRAINT quotation_requests_attempt_count_nonneg
      CHECK (attempt_count >= 0);
  END IF;
END $$;

ALTER TABLE public.quotation_requests
  DROP CONSTRAINT IF EXISTS quotation_requests_status_check;

ALTER TABLE public.quotation_requests
  ADD CONSTRAINT quotation_requests_status_check
  CHECK (status IN ('draft','sending','sent','failed','responded','cancelled'));

-- 2.3 Constraints de integridade de estado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qr_sent_requires_sent_at_msgid'
  ) THEN
    ALTER TABLE public.quotation_requests
      ADD CONSTRAINT qr_sent_requires_sent_at_msgid
      CHECK (status <> 'sent' OR (sent_at IS NOT NULL AND provider_message_id IS NOT NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qr_sending_requires_unsent'
  ) THEN
    ALTER TABLE public.quotation_requests
      ADD CONSTRAINT qr_sending_requires_unsent
      CHECK (status <> 'sending' OR sent_at IS NULL);
  END IF;
END $$;

-- 2.4 Criar email_send_log
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  study_id uuid NOT NULL REFERENCES public.studies(id),
  vendor_id uuid NULL REFERENCES public.study_vendors(id),
  request_id uuid NOT NULL REFERENCES public.quotation_requests(id),
  provider_message_id text NULL,
  event_type text NOT NULL,
  error_code text NULL,
  meta jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_send_log_event_type_check
    CHECK (event_type IN ('attempt','sent','failed','rate_limited','recovered','stuck_cleaned'))
);

-- 2.5 Índices
CREATE INDEX IF NOT EXISTS idx_email_send_log_user_created_at
  ON public.email_send_log(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_email_send_log_study_created_at
  ON public.email_send_log(study_id, created_at);

CREATE INDEX IF NOT EXISTS idx_email_send_log_vendor_created_at
  ON public.email_send_log(vendor_id, created_at);

CREATE INDEX IF NOT EXISTS idx_email_send_log_request_created_at
  ON public.email_send_log(request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_quotation_requests_study_status_sent_at
  ON public.quotation_requests(study_id, status, sent_at);

-- 3) Função lock_key_uuid
CREATE OR REPLACE FUNCTION public.lock_key_uuid(p_prefix text, p_id uuid)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ('x' || substr(md5(p_prefix || ':' || p_id::text), 1, 16))::bit(64)::bigint
$$;

-- 4.1 Limpeza completa de policies antigas (quotation_requests)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quotation_requests'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.quotation_requests', r.policyname);
  END LOOP;
END $$;

-- 4.2 Criar policies mínimas (quotation_requests)
CREATE POLICY qr_select_own
ON public.quotation_requests
FOR SELECT
TO authenticated
USING (public.owns_study(study_id));

CREATE POLICY qr_insert_draft_own
ON public.quotation_requests
FOR INSERT
TO authenticated
WITH CHECK (public.owns_study(study_id) AND status = 'draft');

CREATE POLICY qr_update_own
ON public.quotation_requests
FOR UPDATE
TO authenticated
USING (public.owns_study(study_id))
WITH CHECK (public.owns_study(study_id));

-- 4.3 Grants por coluna (quotation_requests)
REVOKE UPDATE ON public.quotation_requests FROM authenticated;
GRANT UPDATE (message, request_type, vendor_id)
ON public.quotation_requests TO authenticated;

-- 4.4 email_send_log com RLS explícito
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log FORCE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_send_log'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.email_send_log', r.policyname);
  END LOOP;
END $$;

CREATE POLICY esl_select_own
ON public.email_send_log
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY esl_service_insert
ON public.email_send_log
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY esl_service_select
ON public.email_send_log
FOR SELECT
TO service_role
USING (true);

-- 4.5 Grants email_send_log
REVOKE ALL ON public.email_send_log FROM authenticated;
GRANT SELECT ON public.email_send_log TO authenticated;
GRANT INSERT, SELECT ON public.email_send_log TO service_role;

-- 5) Trigger defense-in-depth
CREATE OR REPLACE FUNCTION public.protect_quotation_audit_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') IN ('authenticated','anon') THEN
    IF OLD.status IS DISTINCT FROM NEW.status
       OR OLD.sent_at IS DISTINCT FROM NEW.sent_at
       OR OLD.provider_message_id IS DISTINCT FROM NEW.provider_message_id
       OR OLD.attempt_count IS DISTINCT FROM NEW.attempt_count
       OR OLD.last_attempt_at IS DISTINCT FROM NEW.last_attempt_at
       OR OLD.error_code IS DISTINCT FROM NEW.error_code
       OR OLD.send_key IS DISTINCT FROM NEW.send_key THEN
      RAISE EXCEPTION 'Cannot modify audit columns directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_quotation_audit_columns ON public.quotation_requests;
CREATE TRIGGER trg_protect_quotation_audit_columns
BEFORE UPDATE ON public.quotation_requests
FOR EACH ROW EXECUTE FUNCTION public.protect_quotation_audit_columns();

-- 6) RPC 1 — reserve_quotation_email_send
CREATE OR REPLACE FUNCTION public.reserve_quotation_email_send(p_request_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req record;
  v_now timestamptz := now();
  v_count int;
  v_cooldown interval;
  v_send_key uuid;
BEGIN
  -- 1. Lock request
  PERFORM pg_advisory_xact_lock(lock_key_uuid('request', p_request_id));

  -- 2. Load with FOR UPDATE + ownership
  SELECT qr.*, s.user_id AS study_user_id
  INTO v_req
  FROM quotation_requests qr
  JOIN studies s ON s.id = qr.study_id AND s.is_deleted = false
  WHERE qr.id = p_request_id
  FOR UPDATE OF qr;

  -- 3. NOT_FOUND
  IF v_req IS NULL OR v_req.study_user_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  -- 4. ALREADY_SENT
  IF v_req.status = 'sent' THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_SENT',
      'study_id', v_req.study_id, 'vendor_id', v_req.vendor_id,
      'provider_message_id', v_req.provider_message_id);
  END IF;

  -- 5. MAX_ATTEMPTS
  IF v_req.attempt_count >= 3 AND v_req.status NOT IN ('draft') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MAX_ATTEMPTS');
  END IF;

  -- 5b. Cooldown (backoff)
  IF v_req.status = 'failed' AND v_req.attempt_count >= 1 AND v_req.last_attempt_at IS NOT NULL THEN
    IF v_req.attempt_count = 1 THEN v_cooldown := interval '1 minute';
    ELSIF v_req.attempt_count >= 2 THEN v_cooldown := interval '5 minutes';
    END IF;
    IF v_now < v_req.last_attempt_at + v_cooldown THEN
      RETURN jsonb_build_object('ok', false, 'code', 'COOLDOWN');
    END IF;
  END IF;

  -- 6. Handling sending (stuck recovery)
  IF v_req.status = 'sending' THEN
    IF v_req.last_attempt_at IS NOT NULL AND v_now < v_req.last_attempt_at + interval '5 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CONFLICT');
    END IF;
    -- Recovery: log and continue with same send_key
    INSERT INTO email_send_log (user_id, study_id, vendor_id, request_id, event_type, meta)
    VALUES (p_user_id, v_req.study_id, v_req.vendor_id, p_request_id, 'recovered',
      jsonb_build_object('previous_attempt', v_req.attempt_count, 'previous_last_attempt_at', v_req.last_attempt_at));
  END IF;

  -- 7. Lock user, study, vendor (fixed order)
  PERFORM pg_advisory_xact_lock(lock_key_uuid('user', p_user_id));
  PERFORM pg_advisory_xact_lock(lock_key_uuid('study', v_req.study_id));
  IF v_req.vendor_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(lock_key_uuid('vendor', v_req.vendor_id));
  END IF;

  -- 8. Rate limit (count attempt + rate_limited in last hour)
  SELECT count(*) INTO v_count
  FROM email_send_log
  WHERE user_id = p_user_id
    AND event_type IN ('attempt', 'rate_limited')
    AND created_at > v_now - interval '1 hour';

  -- 9. If exceeded
  IF v_count >= 20 THEN
    INSERT INTO email_send_log (user_id, study_id, vendor_id, request_id, event_type)
    VALUES (p_user_id, v_req.study_id, v_req.vendor_id, p_request_id, 'rate_limited');

    UPDATE quotation_requests
    SET status = 'failed', error_code = 'RATE_LIMIT', last_attempt_at = v_now
    WHERE id = p_request_id AND study_id IN (SELECT id FROM studies WHERE user_id = p_user_id);

    RETURN jsonb_build_object('ok', false, 'code', 'RATE_LIMIT');
  END IF;

  -- 10. Reserve: update to sending
  v_send_key := coalesce(v_req.send_key, gen_random_uuid());

  UPDATE quotation_requests
  SET status = 'sending',
      send_key = v_send_key,
      attempt_count = attempt_count + 1,
      last_attempt_at = v_now,
      error_code = NULL
  WHERE id = p_request_id
    AND study_id IN (SELECT id FROM studies WHERE user_id = p_user_id);

  INSERT INTO email_send_log (user_id, study_id, vendor_id, request_id, event_type)
  VALUES (p_user_id, v_req.study_id, v_req.vendor_id, p_request_id, 'attempt');

  RETURN jsonb_build_object('ok', true, 'code', 'OK',
    'study_id', v_req.study_id,
    'vendor_id', v_req.vendor_id,
    'send_key', v_send_key,
    'attempt_count', v_req.attempt_count + 1);
END;
$$;

-- 6.3 Permissões da RPC reserve
REVOKE EXECUTE ON FUNCTION public.reserve_quotation_email_send(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.reserve_quotation_email_send(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reserve_quotation_email_send(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_quotation_email_send(uuid, uuid) TO service_role;

-- 7) RPC 2 — finalize_quotation_email_send
CREATE OR REPLACE FUNCTION public.finalize_quotation_email_send(
  p_request_id uuid,
  p_user_id uuid,
  p_outcome text,
  p_provider_message_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_provider_http_status int DEFAULT NULL,
  p_provider_latency_ms int DEFAULT NULL,
  p_message_len int DEFAULT NULL,
  p_message_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req record;
  v_rows int;
  v_meta jsonb;
BEGIN
  -- 1. Lock request
  PERFORM pg_advisory_xact_lock(lock_key_uuid('request', p_request_id));

  -- 2. Revalidar ownership
  SELECT qr.*, s.user_id AS study_user_id
  INTO v_req
  FROM quotation_requests qr
  JOIN studies s ON s.id = qr.study_id
  WHERE qr.id = p_request_id
  FOR UPDATE OF qr;

  IF v_req IS NULL OR v_req.study_user_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  -- Build meta
  v_meta := jsonb_build_object(
    'provider_http_status', p_provider_http_status,
    'provider_latency_ms', p_provider_latency_ms,
    'message_len', p_message_len,
    'message_hash', p_message_hash
  );

  IF p_outcome = 'sent' THEN
    -- 3. Update with defensive predicate
    UPDATE quotation_requests
    SET status = 'sent',
        sent_at = now(),
        provider_message_id = p_provider_message_id,
        error_code = NULL
    WHERE id = p_request_id
      AND status = 'sending'
      AND sent_at IS NULL
      AND study_id IN (SELECT id FROM studies WHERE user_id = p_user_id);
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CONFLICT_FINALIZE');
    END IF;

    INSERT INTO email_send_log (user_id, study_id, vendor_id, request_id, provider_message_id, event_type, meta)
    VALUES (p_user_id, v_req.study_id, v_req.vendor_id, p_request_id, p_provider_message_id, 'sent', v_meta);

  ELSIF p_outcome = 'failed' THEN
    -- 4. Update failed
    UPDATE quotation_requests
    SET status = 'failed',
        error_code = p_error_code,
        last_attempt_at = now()
    WHERE id = p_request_id
      AND status = 'sending'
      AND sent_at IS NULL
      AND study_id IN (SELECT id FROM studies WHERE user_id = p_user_id);
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CONFLICT_FINALIZE');
    END IF;

    INSERT INTO email_send_log (user_id, study_id, vendor_id, request_id, event_type, error_code, meta)
    VALUES (p_user_id, v_req.study_id, v_req.vendor_id, p_request_id, 'failed', p_error_code, v_meta);

  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_OUTCOME');
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'OK');
END;
$$;

-- 7.3 Permissões da RPC finalize
REVOKE EXECUTE ON FUNCTION public.finalize_quotation_email_send(uuid, uuid, text, text, text, integer, integer, integer, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.finalize_quotation_email_send(uuid, uuid, text, text, text, integer, integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_quotation_email_send(uuid, uuid, text, text, text, integer, integer, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_quotation_email_send(uuid, uuid, text, text, text, integer, integer, integer, text) TO service_role;
