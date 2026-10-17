-- The RPC validates inputs but does not need to bypass RLS.
-- Run as the authenticated caller so existing tenant/self policies remain in force.
alter function public.record_employee_punch(text, text, boolean) security invoker;
