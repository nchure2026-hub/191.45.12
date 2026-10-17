-- Keep legacy public authorization helpers out of the PostgREST RPC surface.
do $$
begin
 if to_regprocedure('public.can_manage_attendance()') is not null then
  revoke all on function public.can_manage_attendance() from public, anon, authenticated;
 end if;
 if to_regprocedure('public.current_app_role()') is not null then
  revoke all on function public.current_app_role() from public, anon, authenticated;
 end if;
 if to_regprocedure('public.current_company_id()') is not null then
  revoke all on function public.current_company_id() from public, anon, authenticated;
 end if;
end $$;
