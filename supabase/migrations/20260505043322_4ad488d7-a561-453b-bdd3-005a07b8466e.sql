-- 1. Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2. Designate admin email (applied if user exists; otherwise on signup via trigger)
CREATE TABLE public.admin_emails (
  email text PRIMARY KEY
);
INSERT INTO public.admin_emails (email) VALUES ('templay4u@gmail.com');

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = 'templay4u@gmail.com'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_emails WHERE lower(email) = lower(NEW.email)) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_assign_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_admin();

-- 3. Soft-delete columns on tournaments
ALTER TABLE public.tournaments
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid;

CREATE INDEX idx_tournaments_deleted_at ON public.tournaments(deleted_at);

-- 4. Update owns_tournament to exclude deleted (keep existing semantics for live ops)
CREATE OR REPLACE FUNCTION public.owns_tournament(_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE id = _tournament_id AND owner_id = auth.uid()
  );
$$;

-- 5. Refresh tournament RLS to include admin override
DROP POLICY IF EXISTS "Public tournaments are viewable" ON public.tournaments;
DROP POLICY IF EXISTS "Owners can update tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Owners can delete tournaments" ON public.tournaments;

CREATE POLICY "Tournament visibility"
ON public.tournaments FOR SELECT
USING (
  (deleted_at IS NULL AND (is_public OR auth.uid() = owner_id))
  OR auth.uid() = owner_id
  OR public.is_admin()
);

CREATE POLICY "Owners or admin update tournaments"
ON public.tournaments FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id OR public.is_admin())
WITH CHECK (auth.uid() = owner_id OR public.is_admin());

CREATE POLICY "Owners or admin delete tournaments"
ON public.tournaments FOR DELETE
TO authenticated
USING (auth.uid() = owner_id OR public.is_admin());

-- 6. Refresh participants/matches policies so admin & owners can manage
DROP POLICY IF EXISTS "Owners can create participants" ON public.participants;
DROP POLICY IF EXISTS "Owners can update participants" ON public.participants;
DROP POLICY IF EXISTS "Owners can delete participants" ON public.participants;

CREATE POLICY "Owners or admin create participants"
ON public.participants FOR INSERT
TO authenticated
WITH CHECK (public.owns_tournament(tournament_id) OR public.is_admin());

CREATE POLICY "Owners or admin update participants"
ON public.participants FOR UPDATE
TO authenticated
USING (public.owns_tournament(tournament_id) OR public.is_admin())
WITH CHECK (public.owns_tournament(tournament_id) OR public.is_admin());

CREATE POLICY "Owners or admin delete participants"
ON public.participants FOR DELETE
TO authenticated
USING (public.owns_tournament(tournament_id) OR public.is_admin());

DROP POLICY IF EXISTS "Owners can create matches" ON public.matches;
DROP POLICY IF EXISTS "Owners can update matches" ON public.matches;
DROP POLICY IF EXISTS "Owners can delete matches" ON public.matches;

CREATE POLICY "Owners or admin create matches"
ON public.matches FOR INSERT
TO authenticated
WITH CHECK (public.owns_tournament(tournament_id) OR public.is_admin());

CREATE POLICY "Owners or admin update matches"
ON public.matches FOR UPDATE
TO authenticated
USING (public.owns_tournament(tournament_id) OR public.is_admin())
WITH CHECK (public.owns_tournament(tournament_id) OR public.is_admin());

CREATE POLICY "Owners or admin delete matches"
ON public.matches FOR DELETE
TO authenticated
USING (public.owns_tournament(tournament_id) OR public.is_admin());

-- 7. Bin operations
CREATE OR REPLACE FUNCTION public.soft_delete_tournament(_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.owns_tournament(_tournament_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.tournaments
    SET deleted_at = now(), deleted_by = auth.uid()
    WHERE id = _tournament_id AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_tournament(_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.tournaments;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO t FROM public.tournaments WHERE id = _tournament_id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF NOT (t.owner_id = auth.uid() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.tournaments
    SET deleted_at = NULL, deleted_by = NULL
    WHERE id = _tournament_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_tournament(_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.tournaments;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO t FROM public.tournaments WHERE id = _tournament_id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF NOT (t.owner_id = auth.uid() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.matches WHERE tournament_id = _tournament_id;
  DELETE FROM public.participants WHERE tournament_id = _tournament_id;
  DELETE FROM public.tournaments WHERE id = _tournament_id;
END;
$$;