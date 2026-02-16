
-- =====================================================
-- ITEM 3: FORCE ROW LEVEL SECURITY em todas as tabelas
-- Defesa em profundidade: garante que mesmo table owners
-- sem BYPASSRLS respeitem RLS.
-- Nota: postgres tem BYPASSRLS=true, então funções 
-- SECURITY DEFINER (owned by postgres) NÃO serão afetadas.
-- =====================================================

ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_institutions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.studies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.study_inputs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.study_computed FORCE ROW LEVEL SECURITY;
ALTER TABLE public.study_line_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.study_vendors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.study_providers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.study_provider_contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.study_provider_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bills FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bill_installments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_cost_centers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_categories FORCE ROW LEVEL SECURITY;

-- =====================================================
-- ITEM 4: REVOKE EXECUTE de PUBLIC nas funções SECURITY DEFINER
-- e conceder apenas aos roles necessários.
-- =====================================================

-- owns_study: usado em RLS policies, executado no contexto de queries
-- do authenticated user. Precisa ser callable por authenticated.
REVOKE EXECUTE ON FUNCTION public.owns_study(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_study(uuid) TO authenticated;

-- owns_order: idem
REVOKE EXECUTE ON FUNCTION public.owns_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_order(uuid) TO authenticated;

-- soft_delete_study: chamado via RPC pelo app (authenticated user)
REVOKE EXECUTE ON FUNCTION public.soft_delete_study(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_study(uuid) TO authenticated;

-- handle_new_user: trigger function, chamado apenas pelo trigger 
-- on_auth_user_created. Não deve ser invocável diretamente.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- update_updated_at_column: trigger function, não precisa ser chamada diretamente.
-- Mas é usada em triggers que rodam no contexto de authenticated.
-- Triggers executam com as permissões da função, não do caller.
-- Como NÃO é SECURITY DEFINER, roda com permissões do caller.
-- Manter para authenticated para que triggers funcionem.
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO postgres;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
