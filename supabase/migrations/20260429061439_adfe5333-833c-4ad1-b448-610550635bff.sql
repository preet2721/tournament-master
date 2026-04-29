CREATE TYPE public.tournament_format AS ENUM ('Knockout', 'Round Robin');
CREATE TYPE public.tournament_status AS ENUM ('Draft', 'Live', 'Completed');
CREATE TYPE public.match_status AS ENUM ('Scheduled', 'Live', 'Completed');

CREATE TABLE public.tournaments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  game_type TEXT NOT NULL,
  format public.tournament_format NOT NULL,
  participant_target INTEGER NOT NULL DEFAULT 4,
  tournament_code TEXT NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  status public.tournament_status NOT NULL DEFAULT 'Draft',
  champion_participant_id UUID,
  match_duration_minutes INTEGER NOT NULL DEFAULT 30,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  team_name TEXT,
  logo_url TEXT,
  seed INTEGER NOT NULL DEFAULT 1,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  score_for INTEGER NOT NULL DEFAULT 0,
  score_against INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 1,
  match_number INTEGER NOT NULL DEFAULT 1,
  participant1_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  participant2_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  score1 INTEGER NOT NULL DEFAULT 0,
  score2 INTEGER NOT NULL DEFAULT 0,
  winner_participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  status public.match_status NOT NULL DEFAULT 'Scheduled',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  bracket_slot TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tournaments_updated_at
BEFORE UPDATE ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_participants_updated_at
BEFORE UPDATE ON public.participants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_matches_updated_at
BEFORE UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.owns_tournament(_tournament_id UUID)
RETURNS BOOLEAN
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

CREATE POLICY "Public tournaments are viewable"
ON public.tournaments
FOR SELECT
USING (is_public OR auth.uid() = owner_id);

CREATE POLICY "Authenticated users can create tournaments"
ON public.tournaments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update tournaments"
ON public.tournaments
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete tournaments"
ON public.tournaments
FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Participants follow tournament visibility"
ON public.participants
FOR SELECT
USING (EXISTS (SELECT 1 FROM public.tournaments WHERE tournaments.id = participants.tournament_id AND (tournaments.is_public OR tournaments.owner_id = auth.uid())));

CREATE POLICY "Owners can create participants"
ON public.participants
FOR INSERT
TO authenticated
WITH CHECK (public.owns_tournament(tournament_id));

CREATE POLICY "Owners can update participants"
ON public.participants
FOR UPDATE
TO authenticated
USING (public.owns_tournament(tournament_id))
WITH CHECK (public.owns_tournament(tournament_id));

CREATE POLICY "Owners can delete participants"
ON public.participants
FOR DELETE
TO authenticated
USING (public.owns_tournament(tournament_id));

CREATE POLICY "Matches follow tournament visibility"
ON public.matches
FOR SELECT
USING (EXISTS (SELECT 1 FROM public.tournaments WHERE tournaments.id = matches.tournament_id AND (tournaments.is_public OR tournaments.owner_id = auth.uid())));

CREATE POLICY "Owners can create matches"
ON public.matches
FOR INSERT
TO authenticated
WITH CHECK (public.owns_tournament(tournament_id));

CREATE POLICY "Owners can update matches"
ON public.matches
FOR UPDATE
TO authenticated
USING (public.owns_tournament(tournament_id))
WITH CHECK (public.owns_tournament(tournament_id));

CREATE POLICY "Owners can delete matches"
ON public.matches
FOR DELETE
TO authenticated
USING (public.owns_tournament(tournament_id));

CREATE INDEX idx_tournaments_owner_id ON public.tournaments(owner_id);
CREATE INDEX idx_tournaments_code ON public.tournaments(tournament_code);
CREATE INDEX idx_participants_tournament_id ON public.participants(tournament_id);
CREATE INDEX idx_matches_tournament_id ON public.matches(tournament_id);

ALTER TABLE public.tournaments REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.matches REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;