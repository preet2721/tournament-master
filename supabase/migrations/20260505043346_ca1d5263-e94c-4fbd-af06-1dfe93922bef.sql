ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins read admin_emails"
ON public.admin_emails FOR SELECT
TO authenticated
USING (public.is_admin());