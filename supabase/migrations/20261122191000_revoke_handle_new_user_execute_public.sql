-- Follow-up to 20261122190000: anon/authenticated also inherit EXECUTE through the
-- default PUBLIC grant, so revoke it there too. Only postgres (owner) and
-- service_role keep EXECUTE. The on_auth_user_created trigger still fires.
revoke execute on function public.handle_new_user() from public;
