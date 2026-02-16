
-- Remover EXECUTE do role anon em funções que não devem ser chamáveis sem autenticação
REVOKE EXECUTE ON FUNCTION public.owns_study(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owns_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_study(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
