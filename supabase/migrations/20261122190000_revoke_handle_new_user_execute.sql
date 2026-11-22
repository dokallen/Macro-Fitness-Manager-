-- handle_new_user() is a SECURITY DEFINER trigger function. It only needs to run
-- from the on_auth_user_created trigger, never via the public REST API (/rest/v1/rpc).
-- Revoking EXECUTE from the API roles clears Supabase advisor lints 0028/0029.
-- Trigger firing does not check EXECUTE privilege, so sign-up is unaffected.
revoke execute on function public.handle_new_user() from anon, authenticated;
