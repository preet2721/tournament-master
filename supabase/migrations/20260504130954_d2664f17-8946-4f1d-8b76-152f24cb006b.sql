CREATE OR REPLACE FUNCTION public.join_tournament_as_player(
  _tournament_code text,
  _name text,
  _team_name text DEFAULT NULL,
  _logo_url text DEFAULT NULL
)
RETURNS public.participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.tournaments;
  current_count int;
  next_seed int;
  inserted public.participants;
  clean_name text := btrim(_name);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to join';
  END IF;

  IF clean_name IS NULL OR length(clean_name) = 0 THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  SELECT * INTO t FROM public.tournaments
   WHERE tournament_code = upper(btrim(_tournament_code))
   LIMIT 1;

  IF t.id IS NULL THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF NOT t.is_public AND t.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Tournament is private';
  END IF;

  IF t.status <> 'Draft' THEN
    RAISE EXCEPTION 'Registration is closed for this tournament';
  END IF;

  SELECT count(*) INTO current_count FROM public.participants WHERE tournament_id = t.id;
  IF current_count >= t.participant_target THEN
    RAISE EXCEPTION 'Tournament roster is full';
  END IF;

  IF EXISTS (SELECT 1 FROM public.participants WHERE tournament_id = t.id AND lower(name) = lower(clean_name)) THEN
    RAISE EXCEPTION 'A competitor with that name is already registered';
  END IF;

  next_seed := current_count + 1;

  INSERT INTO public.participants (tournament_id, name, team_name, logo_url, seed)
  VALUES (t.id, clean_name, NULLIF(btrim(_team_name), ''), NULLIF(btrim(_logo_url), ''), next_seed)
  RETURNING * INTO inserted;

  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_tournament_as_player(text, text, text, text) TO authenticated;