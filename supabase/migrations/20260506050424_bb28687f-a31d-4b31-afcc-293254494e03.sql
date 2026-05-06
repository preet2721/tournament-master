-- Add mode (Solo/Team) to tournaments
CREATE TYPE public.tournament_mode AS ENUM ('Solo', 'Team');
ALTER TABLE public.tournaments ADD COLUMN mode public.tournament_mode NOT NULL DEFAULT 'Solo';

-- Players inside a team participant (only used when tournament.mode='Team')
CREATE TABLE public.team_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_players_participant ON public.team_players(participant_id);

ALTER TABLE public.team_players ENABLE ROW LEVEL SECURITY;

-- View follows tournament visibility
CREATE POLICY "Team players follow tournament visibility"
ON public.team_players FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.participants p
  JOIN public.tournaments t ON t.id = p.tournament_id
  WHERE p.id = team_players.participant_id
    AND (t.is_public OR t.owner_id = auth.uid() OR public.is_admin())
));

-- Owner or admin manage
CREATE POLICY "Owners or admin insert team players"
ON public.team_players FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.participants p
  WHERE p.id = team_players.participant_id
    AND (public.owns_tournament(p.tournament_id) OR public.is_admin())
));

CREATE POLICY "Owners or admin update team players"
ON public.team_players FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.participants p
  WHERE p.id = team_players.participant_id
    AND (public.owns_tournament(p.tournament_id) OR public.is_admin())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.participants p
  WHERE p.id = team_players.participant_id
    AND (public.owns_tournament(p.tournament_id) OR public.is_admin())
));

CREATE POLICY "Owners or admin delete team players"
ON public.team_players FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.participants p
  WHERE p.id = team_players.participant_id
    AND (public.owns_tournament(p.tournament_id) OR public.is_admin())
));