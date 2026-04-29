REVOKE ALL ON FUNCTION public.owns_tournament(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_tournament(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.owns_tournament(UUID) FROM authenticated;