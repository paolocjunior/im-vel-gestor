-- Allow updating system catalog items (for renaming)
DROP POLICY IF EXISTS "Update own catalog" ON construction_stage_catalog;
CREATE POLICY "Update own catalog" ON construction_stage_catalog
  FOR UPDATE USING (
    (auth.uid() = user_id) OR (is_system = true)
  );

-- Allow deleting system catalog items  
DROP POLICY IF EXISTS "Delete own catalog" ON construction_stage_catalog;
CREATE POLICY "Delete own catalog" ON construction_stage_catalog
  FOR DELETE USING (
    (auth.uid() = user_id) OR (is_system = true)
  );