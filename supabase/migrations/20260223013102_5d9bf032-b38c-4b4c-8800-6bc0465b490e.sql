
-- 1. Add pv_last_synced_at to studies for dirty-check
ALTER TABLE public.studies ADD COLUMN IF NOT EXISTS pv_last_synced_at timestamptz DEFAULT NULL;

-- 2. Create atomic PV sync function with advisory lock and concurrency control
CREATE OR REPLACE FUNCTION public.sync_pv_monthly(
  p_study_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lock_key bigint;
  v_deleted int;
  v_inserted int;
BEGIN
  -- Verify ownership
  IF NOT owns_study(p_study_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  -- Advisory lock per study to prevent concurrent sync
  -- Convert first 8 bytes of UUID to bigint for pg_advisory_xact_lock
  v_lock_key := ('x' || replace(p_study_id::text, '-', ''))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Delete all existing planned values for this study
  DELETE FROM construction_stage_monthly_values
  WHERE study_id = p_study_id AND value_type = 'planned';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Insert new planned values from JSON array
  IF jsonb_array_length(COALESCE(p_rows, '[]'::jsonb)) > 0 THEN
    INSERT INTO construction_stage_monthly_values (stage_id, study_id, month_key, value, value_type)
    SELECT
      (r->>'stage_id')::uuid,
      p_study_id,
      r->>'month_key',
      (r->>'value')::numeric,
      'planned'
    FROM jsonb_array_elements(p_rows) AS r;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  ELSE
    v_inserted := 0;
  END IF;

  -- Update sync timestamp on the study
  UPDATE studies SET pv_last_synced_at = now() WHERE id = p_study_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted', v_deleted,
    'inserted', v_inserted
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

-- Revoke from anon/public for security
REVOKE EXECUTE ON FUNCTION public.sync_pv_monthly(uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.sync_pv_monthly(uuid, jsonb) TO authenticated;
