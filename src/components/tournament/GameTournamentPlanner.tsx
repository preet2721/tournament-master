import { FormEvent, useEffect, useMemo, useState } from "react";
import { Trophy, Users, Swords, Timer, Share2, FileDown, Sparkles, Trash2, Pencil, Plus, ShieldCheck, LogOut, RotateCcw, ShieldAlert } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

type Format = "Knockout" | "Round Robin";
type TournamentStatus = "Draft" | "Live" | "Completed";
type MatchStatus = "Scheduled" | "Live" | "Completed";

type Tournament = {
  id: string;
  owner_id: string;
  name: string;
  game_type: string;
  format: Format;
  participant_target: number;
  tournament_code: string;
  status: TournamentStatus;
  champion_participant_id: string | null;
  match_duration_minutes: number;
  is_public: boolean;
  created_at: string;
  deleted_at: string | null;
};

type Participant = {
  id: string;
  tournament_id: string;
  name: string;
  team_name: string | null;
  logo_url: string | null;
  seed: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  score_for: number;
  score_against: number;
};

type Match = {
  id: string;
  tournament_id: string;
  round_number: number;
  match_number: number;
  participant1_id: string | null;
  participant2_id: string | null;
  score1: number;
  score2: number;
  winner_participant_id: string | null;
  status: MatchStatus;
  scheduled_at: string | null;
  bracket_slot: string | null;
};

type SessionUser = { id: string; email?: string } | null;

const db = supabase as any;

const tournamentSchema = z.object({
  name: z.string().trim().min(3, "Tournament name needs at least 3 characters").max(80),
  game_type: z.string().trim().min(2, "Game type is required").max(40),
  participant_target: z.coerce.number().int().min(2).max(64),
  format: z.enum(["Knockout", "Round Robin"]),
  match_duration_minutes: z.coerce.number().int().min(5).max(240),
  tournament_code: z.string().trim().regex(/^[A-Z0-9]{4,16}$/i, "Use 4-16 letters or numbers").optional().or(z.literal("")),
});

const authSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

const formatTime = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = Math.floor(safe % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};

const games = ["Valorant", "BGMI", "FIFA", "CS2", "Fortnite", "Rocket League"];

export function GameTournamentPlanner() {
  const { toast } = useToast();
  const [user, setUser] = useState<SessionUser>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkNames, setBulkNames] = useState("Team A\nTeam B\nTeam C\nTeam D");
  const [newParticipant, setNewParticipant] = useState({ name: "", team_name: "", logo_url: "" });
  const [editingParticipant, setEditingParticipant] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pointer, setPointer] = useState({ x: 50, y: 18 });
  const [form, setForm] = useState({
    name: "Valorant Championship",
    game_type: "Valorant",
    participant_target: 4,
    format: "Knockout" as Format,
    match_duration_minutes: 30,
    tournament_code: "",
  });
  const [joinCode, setJoinCode] = useState("");
  const [joinPlayerName, setJoinPlayerName] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"active" | "bin">("active");
  const [isAdmin, setIsAdmin] = useState(false);
  const [joinedIds, setJoinedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("joinedTournamentIds") ?? "[]"); } catch { return []; }
  });
  const rememberJoined = (id: string) => {
    setJoinedIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [id, ...prev].slice(0, 50);
      localStorage.setItem("joinedTournamentIds", JSON.stringify(next));
      return next;
    });
  };

  const visibleTournaments = useMemo(() => {
    const inBin = view === "bin";
    const base = tournaments.filter((t) => inBin ? !!t.deleted_at : !t.deleted_at);
    const q = search.trim().toLowerCase();
    if (q) {
      return base.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.tournament_code.toLowerCase().includes(q) ||
        t.game_type.toLowerCase().includes(q)
      );
    }
    if (inBin) return base;
    const mine = base.filter((t) => user && t.owner_id === user.id);
    const joined = base.filter((t) => joinedIds.includes(t.id) && !(user && t.owner_id === user.id));
    const others = base
      .filter((t) => !(user && t.owner_id === user.id) && !joinedIds.includes(t.id))
      .slice(0, 5);
    return [...mine, ...joined, ...others];
  }, [tournaments, search, user, joinedIds, view]);

  const selectedTournament = tournaments.find((item) => item.id === selectedId) ?? null;
  const participantMap = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const champion = selectedTournament?.champion_participant_id ? participantMap.get(selectedTournament.champion_participant_id) : null;
  const isOwner = Boolean(user && selectedTournament && selectedTournament.owner_id === user.id);
  const canManage = isOwner || isAdmin;

  const standings = useMemo(() => [...participants].sort((a, b) => b.points - a.points || b.wins - a.wins || b.score_for - b.score_against - (a.score_for - a.score_against)), [participants]);
  const rounds = useMemo(() => {
    return matches.reduce<Record<number, Match[]>>((acc, match) => {
      acc[match.round_number] = [...(acc[match.round_number] ?? []), match].sort((a, b) => a.match_number - b.match_number);
      return acc;
    }, {});
  }, [matches]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? undefined } : null);
    });
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email ?? undefined } : null));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadTournaments();
    if (user?.id) {
      db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
        .then(({ data }: any) => setIsAdmin(!!data));
    } else {
      setIsAdmin(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!selectedId) return;
    loadTournamentData(selectedId);
    const channel = supabase
      .channel(`tournament-${selectedId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, () => loadTournaments(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `tournament_id=eq.${selectedId}` }, () => loadTournamentData(selectedId, false))
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${selectedId}` }, () => loadTournamentData(selectedId, false))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  const loadTournaments = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    const code = new URLSearchParams(window.location.search).get("code");
    const query = code ? db.from("tournaments").select("*").eq("tournament_code", code) : db.from("tournaments").select("*").order("created_at", { ascending: false }).limit(50);
    const { data, error } = await query;
    if (error) toast({ title: "Could not load tournaments", description: error.message, variant: "destructive" });
    const rows = (data ?? []) as Tournament[];
    setTournaments(rows);
    setSelectedId((current) => current && rows.some((item) => item.id === current) ? current : rows[0]?.id ?? null);
    setLoading(false);
  };

  const loadTournamentData = async (tournamentId: string, showErrors = true) => {
    const [playersRes, matchesRes] = await Promise.all([
      db.from("participants").select("*").eq("tournament_id", tournamentId).order("seed"),
      db.from("matches").select("*").eq("tournament_id", tournamentId).order("round_number").order("match_number"),
    ]);
    if (playersRes.error && showErrors) toast({ title: "Roster failed", description: playersRes.error.message, variant: "destructive" });
    if (matchesRes.error && showErrors) toast({ title: "Matches failed", description: matchesRes.error.message, variant: "destructive" });
    setParticipants((playersRes.data ?? []) as Participant[]);
    setMatches((matchesRes.data ?? []) as Match[]);
  };

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = authSchema.safeParse(authForm);
    if (!parsed.success) return toast({ title: "Check your login details", description: parsed.error.issues[0].message, variant: "destructive" });
    setAuthLoading(true);
    const action = authMode === "signup" ? supabase.auth.signUp : supabase.auth.signInWithPassword;
    const { error } = await action.call(supabase.auth, parsed.data);
    setAuthLoading(false);
    if (error) return toast({ title: "Authentication failed", description: error.message, variant: "destructive" });
    toast({ title: authMode === "signup" ? "Verify your email" : "Welcome back", description: authMode === "signup" ? "Check your inbox before signing in." : "Your command center is online." });
  };

  const signInWithGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast({ title: "Google sign-in failed", description: String(result.error.message ?? result.error), variant: "destructive" });
  };

  const createTournament = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return toast({ title: "Login required", description: "Sign in to create and manage tournaments.", variant: "destructive" });
    const parsed = tournamentSchema.safeParse(form);
    if (!parsed.success) return toast({ title: "Tournament form error", description: parsed.error.issues[0].message, variant: "destructive" });
    const { tournament_code, ...rest } = parsed.data;
    const customCode = tournament_code?.trim().toUpperCase();
    if (customCode) {
      const { data: exists } = await db.from("tournaments").select("id").eq("tournament_code", customCode).maybeSingle();
      if (exists) return toast({ title: "ID already taken", description: "Pick a different joining ID.", variant: "destructive" });
    }
    const insertPayload: any = { ...rest, owner_id: user.id, status: "Draft", is_public: true };
    if (customCode) insertPayload.tournament_code = customCode;
    const { data, error } = await db.from("tournaments").insert(insertPayload).select().single();
    if (error) return toast({ title: "Tournament not created", description: error.message, variant: "destructive" });
    setTournaments((items) => [data as Tournament, ...items]);
    setSelectedId(data.id);
    setForm((f) => ({ ...f, tournament_code: "" }));
    toast({ title: "Tournament ID generated", description: `Share code ${data.tournament_code} is ready.` });
  };

  const loadDemo = async () => {
    if (!user) return toast({ title: "Login required", description: "Sign in to load the demo tournament.", variant: "destructive" });
    const demoCode = `DEMO${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: t, error: tErr } = await db.from("tournaments").insert({
      owner_id: user.id, name: "Valorant Demo Cup", game_type: "Valorant",
      format: "Knockout", participant_target: 4, match_duration_minutes: 30,
      status: "Draft", is_public: true, tournament_code: demoCode,
    }).select().single();
    if (tErr) return toast({ title: "Demo failed", description: tErr.message, variant: "destructive" });
    const demoTeams = ["Team Phoenix", "Team Dragons", "Team Wolves", "Team Titans"];
    const { error: pErr } = await db.from("participants").insert(
      demoTeams.map((name, i) => ({ tournament_id: t.id, name, seed: i + 1 }))
    );
    if (pErr) return toast({ title: "Demo roster failed", description: pErr.message, variant: "destructive" });
    setTournaments((items) => [t as Tournament, ...items]);
    setSelectedId(t.id);
    toast({ title: "Demo loaded", description: `${t.name} ready — hit "Generate Schedule" in the Bracket tab.` });
  };

  const joinTournament = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return toast({ title: "Enter an ID", description: "Type a tournament joining ID.", variant: "destructive" });
    const { data, error } = await db.from("tournaments").select("*").eq("tournament_code", code).maybeSingle();
    if (error) return toast({ title: "Lookup failed", description: error.message, variant: "destructive" });
    if (!data) return toast({ title: "Not found", description: `No tournament with ID ${code}.`, variant: "destructive" });
    setTournaments((items) => items.some((t) => t.id === data.id) ? items : [data as Tournament, ...items]);
    rememberJoined(data.id);
    setSelectedId(data.id);
    setJoinCode("");
    toast({ title: "Tournament loaded", description: data.name });
  };

  const registerAsPlayer = async () => {
    if (!user) return toast({ title: "Sign in required", description: "Please sign in before registering.", variant: "destructive" });
    const code = joinCode.trim().toUpperCase();
    const playerName = joinPlayerName.trim();
    if (!code) return toast({ title: "Enter an ID", description: "Type a tournament joining ID.", variant: "destructive" });
    if (!playerName) return toast({ title: "Enter your name", description: "Type the player or team name to register.", variant: "destructive" });
    const { error } = await db.rpc("join_tournament_as_player", {
      _tournament_code: code,
      _name: playerName,
      _team_name: null,
      _logo_url: null,
    });
    if (error) return toast({ title: "Could not register", description: error.message, variant: "destructive" });
    const { data: t } = await db.from("tournaments").select("*").eq("tournament_code", code).maybeSingle();
    if (t) {
      setTournaments((items) => items.some((x) => x.id === t.id) ? items : [t as Tournament, ...items]);
      rememberJoined(t.id);
      setSelectedId(t.id);
    }
    setJoinPlayerName("");
    toast({ title: "Registered!", description: `${playerName} joined the tournament.` });
  };

  const addParticipants = async () => {
    if (!selectedTournament || !isOwner) return;
    const names = bulkNames.split(/[\n,]+/).map((name) => name.trim()).filter(Boolean).slice(0, 64);
    if (!names.length) return toast({ title: "No names found", description: "Paste one player or team per line.", variant: "destructive" });
    const startSeed = participants.length + 1;
    const rows = names.map((name, index) => ({ tournament_id: selectedTournament.id, name, seed: startSeed + index }));
    const { error } = await db.from("participants").insert(rows);
    if (error) return toast({ title: "Could not add roster", description: error.message, variant: "destructive" });
    setBulkNames("");
    await loadTournamentData(selectedTournament.id);
  };

  const saveParticipant = async () => {
    if (!selectedTournament || !isOwner) return;
    const name = newParticipant.name.trim();
    if (!name) return toast({ title: "Name required", description: "Add a player or team name.", variant: "destructive" });
    const payload = { name, team_name: newParticipant.team_name.trim() || null, logo_url: newParticipant.logo_url.trim() || null };
    const request = editingParticipant
      ? db.from("participants").update(payload).eq("id", editingParticipant)
      : db.from("participants").insert({ ...payload, tournament_id: selectedTournament.id, seed: participants.length + 1 });
    const { error } = await request;
    if (error) return toast({ title: "Roster update failed", description: error.message, variant: "destructive" });
    setNewParticipant({ name: "", team_name: "", logo_url: "" });
    setEditingParticipant(null);
    await loadTournamentData(selectedTournament.id);
  };

  const removeParticipant = async (id: string) => {
    if (!isOwner) return;
    const { error } = await db.from("participants").delete().eq("id", id);
    if (error) return toast({ title: "Could not delete player", description: error.message, variant: "destructive" });
    await loadTournamentData(selectedTournament!.id);
  };

  const generateSchedule = async () => {
    if (!selectedTournament || !isOwner) return;
    if (participants.length < 2) return toast({ title: "More competitors needed", description: "Add at least two players or teams.", variant: "destructive" });
    await db.from("matches").delete().eq("tournament_id", selectedTournament.id);
    const ordered = [...participants].sort((a, b) => a.seed - b.seed);
    const baseTime = Date.now() + 10 * 60 * 1000;
    const rows = selectedTournament.format === "Knockout"
      ? ordered.reduce<any[]>((acc, player, index, array) => {
          if (index % 2 === 0) acc.push({ tournament_id: selectedTournament.id, round_number: 1, match_number: acc.length + 1, participant1_id: player.id, participant2_id: array[index + 1]?.id ?? null, scheduled_at: new Date(baseTime + acc.length * selectedTournament.match_duration_minutes * 60000).toISOString(), bracket_slot: `R1-M${acc.length + 1}` });
          return acc;
        }, [])
      : ordered.flatMap((player, i) => ordered.slice(i + 1).map((opponent, j) => ({ tournament_id: selectedTournament.id, round_number: i + 1, match_number: j + 1, participant1_id: player.id, participant2_id: opponent.id, scheduled_at: new Date(baseTime + (i + j) * selectedTournament.match_duration_minutes * 60000).toISOString(), bracket_slot: `RR-${i + 1}-${j + 1}` })));
    const { error } = await db.from("matches").insert(rows);
    if (error) return toast({ title: "Schedule failed", description: error.message, variant: "destructive" });
    await db.from("tournaments").update({ status: "Live", champion_participant_id: null }).eq("id", selectedTournament.id);
    await loadTournaments(false);
    await loadTournamentData(selectedTournament.id);
    toast({ title: "Schedule generated", description: selectedTournament.format === "Knockout" ? "Single-elimination bracket is live." : "Round-robin table is live." });
  };

  const updateScore = async (match: Match, score1: number, score2: number) => {
    if (!selectedTournament || !isOwner) return;
    const winner = score1 === score2 ? null : score1 > score2 ? match.participant1_id : match.participant2_id;
    const status: MatchStatus = match.participant1_id && match.participant2_id ? "Completed" : "Scheduled";
    const { error } = await db.from("matches").update({ score1, score2, winner_participant_id: winner, status }).eq("id", match.id);
    if (error) return toast({ title: "Score not saved", description: error.message, variant: "destructive" });
    const refreshed = await db.from("matches").select("*").eq("tournament_id", selectedTournament.id).order("round_number").order("match_number");
    const nextMatches = (refreshed.data ?? []) as Match[];
    setMatches(nextMatches);
    await recalculateStats(nextMatches);
    if (selectedTournament.format === "Knockout") await advanceKnockout(nextMatches);
    if (selectedTournament.format === "Round Robin" && nextMatches.length && nextMatches.every((m) => m.status === "Completed")) await declareRoundRobinWinner(nextMatches);
  };

  const recalculateStats = async (sourceMatches: Match[]) => {
    if (!selectedTournament) return;
    const stats = participants.map((p) => ({ ...p, wins: 0, losses: 0, draws: 0, points: 0, score_for: 0, score_against: 0 }));
    sourceMatches.filter((m) => m.status === "Completed" && m.participant1_id && m.participant2_id).forEach((match) => {
      const a = stats.find((p) => p.id === match.participant1_id);
      const b = stats.find((p) => p.id === match.participant2_id);
      if (!a || !b) return;
      a.score_for += match.score1; a.score_against += match.score2;
      b.score_for += match.score2; b.score_against += match.score1;
      if (match.score1 === match.score2) { a.draws++; b.draws++; a.points++; b.points++; }
      else if (match.score1 > match.score2) { a.wins++; b.losses++; a.points += 3; }
      else { b.wins++; a.losses++; b.points += 3; }
    });
    await Promise.all(stats.map((p) => db.from("participants").update({ wins: p.wins, losses: p.losses, draws: p.draws, points: p.points, score_for: p.score_for, score_against: p.score_against }).eq("id", p.id)));
    await loadTournamentData(selectedTournament.id, false);
  };

  const advanceKnockout = async (sourceMatches: Match[]) => {
    if (!selectedTournament) return;
    const maxRound = Math.max(...sourceMatches.map((m) => m.round_number));
    const currentRound = sourceMatches.filter((m) => m.round_number === maxRound);
    if (!currentRound.length || !currentRound.every((m) => m.status === "Completed" || !m.participant2_id)) return;
    const winners = currentRound.map((m) => m.winner_participant_id ?? m.participant1_id).filter(Boolean) as string[];
    if (winners.length === 1) {
      await db.from("tournaments").update({ status: "Completed", champion_participant_id: winners[0] }).eq("id", selectedTournament.id);
      await loadTournaments(false);
      toast({ title: "Champion declared", description: `${participantMap.get(winners[0])?.name ?? "Winner"} takes the trophy.` });
      return;
    }
    const existingNext = sourceMatches.some((m) => m.round_number === maxRound + 1);
    if (existingNext) return;
    const rows = winners.reduce<any[]>((acc, id, index, array) => {
      if (index % 2 === 0) acc.push({ tournament_id: selectedTournament.id, round_number: maxRound + 1, match_number: acc.length + 1, participant1_id: id, participant2_id: array[index + 1] ?? null, scheduled_at: new Date(Date.now() + (acc.length + 1) * selectedTournament.match_duration_minutes * 60000).toISOString(), bracket_slot: `R${maxRound + 1}-M${acc.length + 1}` });
      return acc;
    }, []);
    await db.from("matches").insert(rows);
    await loadTournamentData(selectedTournament.id, false);
  };

  const declareRoundRobinWinner = async (_sourceMatches: Match[]) => {
    if (!selectedTournament) return;
    const leader = [...participants].sort((a, b) => b.points - a.points || b.score_for - b.score_against - (a.score_for - a.score_against))[0];
    if (leader) {
      await db.from("tournaments").update({ status: "Completed", champion_participant_id: leader.id }).eq("id", selectedTournament.id);
      await loadTournaments(false);
    }
  };

  const shareTournament = async () => {
    if (!selectedTournament) return;
    const url = `${window.location.origin}${window.location.pathname}?code=${selectedTournament.tournament_code}`;
    await navigator.clipboard.writeText(url);
    toast({ title: "Share link copied", description: selectedTournament.tournament_code });
  };

  const exportResults = () => {
    if (!selectedTournament) return;
    const matchRows = matches.map((m) => `<tr><td>R${m.round_number} M${m.match_number}</td><td>${participantMap.get(m.participant1_id ?? "")?.name ?? "TBD"}</td><td>${m.score1}-${m.score2}</td><td>${participantMap.get(m.participant2_id ?? "")?.name ?? "TBD"}</td><td>${participantMap.get(m.winner_participant_id ?? "")?.name ?? "Pending"}</td></tr>`).join("");
    const tableRows = standings.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.points}</td><td>${p.wins}-${p.losses}-${p.draws}</td><td>${p.score_for - p.score_against}</td></tr>`).join("");
    const printWindow = window.open("", "_blank");
    printWindow?.document.write(`<html><head><title>${selectedTournament.name} Results</title><style>body{font-family:Arial;background:#080b18;color:#e9ffff;padding:32px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border:1px solid #25f4ee;padding:10px}h1{color:#25f4ee}</style></head><body><h1>${selectedTournament.name}</h1><h2>Standings</h2><table><tbody>${tableRows}</tbody></table><h2>Matches</h2><table><tbody>${matchRows}</tbody></table></body></html>`);
    printWindow?.document.close();
    printWindow?.print();
  };

  const canManageTournament = (t: Tournament) => Boolean(user && (t.owner_id === user.id || isAdmin));

  const softDeleteTournament = async (t: Tournament) => {
    if (!canManageTournament(t)) return;
    const { error } = await db.rpc("soft_delete_tournament", { _tournament_id: t.id });
    if (error) return toast({ title: "Could not move to bin", description: error.message, variant: "destructive" });
    toast({ title: "Moved to Bin", description: `${t.name} can be restored from the Bin.` });
    if (selectedId === t.id) setSelectedId(null);
    await loadTournaments(false);
  };

  const restoreTournament = async (t: Tournament) => {
    if (!canManageTournament(t)) return;
    const { error } = await db.rpc("restore_tournament", { _tournament_id: t.id });
    if (error) return toast({ title: "Restore failed", description: error.message, variant: "destructive" });
    toast({ title: "Restored", description: t.name });
    await loadTournaments(false);
  };

  const purgeTournament = async (t: Tournament) => {
    if (!canManageTournament(t)) return;
    const { error } = await db.rpc("purge_tournament", { _tournament_id: t.id });
    if (error) return toast({ title: "Purge failed", description: error.message, variant: "destructive" });
    toast({ title: "Permanently deleted", description: t.name });
    if (selectedId === t.id) setSelectedId(null);
    await loadTournaments(false);
  };

  const activeMatch = matches.find((m) => m.status !== "Completed" && m.scheduled_at);
  const countdownSeconds = activeMatch?.scheduled_at ? Math.floor((new Date(activeMatch.scheduled_at).getTime() - now) / 1000) : 0;

  return (
    <main
      className="arena-grid min-h-screen overflow-hidden bg-hero text-foreground"
      style={{ "--mx": `${pointer.x}%`, "--my": `${pointer.y}%` } as React.CSSProperties}
      onPointerMove={(event) => setPointer({ x: (event.clientX / window.innerWidth) * 100, y: (event.clientY / window.innerHeight) * 100 })}
    >
      <section className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-neon opacity-20 blur-3xl" />
        <header className="relative flex flex-col gap-4 border-b border-primary/20 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-display text-sm uppercase text-primary">Game Tournament Planner</p>
            <h1 className="font-display text-4xl font-black uppercase leading-tight md:text-6xl">Neon bracket command center</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedTournament && <Button variant="arcade" onClick={shareTournament}><Share2 /> Share</Button>}
            {selectedTournament && <Button variant="arcade" onClick={exportResults}><FileDown /> PDF</Button>}
            {user ? <Button variant="arcade" onClick={() => supabase.auth.signOut()}><LogOut /> Logout</Button> : null}
          </div>
        </header>

        {!user && <AuthPanel authMode={authMode} setAuthMode={setAuthMode} form={authForm} setForm={setAuthForm} loading={authLoading} onSubmit={handleAuth} onGoogle={signInWithGoogle} />}

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-5">
            <Panel title="Create Tournament" icon={<Sparkles className="text-primary" />}>
              <form className="space-y-3" onSubmit={createTournament}>
                <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Game Type">
                  <Select value={form.game_type} onValueChange={(value) => setForm({ ...form, game_type: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{games.map((game) => <SelectItem key={game} value={game}>{game}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Players"><Input type="number" min={2} max={64} value={form.participant_target} onChange={(e) => setForm({ ...form, participant_target: Number(e.target.value) })} /></Field>
                  <Field label="Minutes"><Input type="number" min={5} max={240} value={form.match_duration_minutes} onChange={(e) => setForm({ ...form, match_duration_minutes: Number(e.target.value) })} /></Field>
                </div>
                <Field label="Format">
                  <Select value={form.format} onValueChange={(value: Format) => setForm({ ...form, format: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Knockout">Knockout</SelectItem><SelectItem value="Round Robin">Round Robin</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label="Custom Joining ID (optional)">
                  <Input
                    value={form.tournament_code}
                    onChange={(e) => setForm({ ...form, tournament_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) })}
                    placeholder="e.g. VALO2026 (auto if empty)"
                  />
                </Field>
                <Button className="w-full" variant="neon" type="submit"><Trophy /> Generate ID</Button>
                <Button className="w-full" variant="arcade" type="button" onClick={loadDemo}><Sparkles /> Load Demo Tournament</Button>
              </form>
            </Panel>

            <Panel title="Join Tournament" icon={<Users className="text-accent" />}>
              <div className="space-y-2">
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter tournament ID"
                  onKeyDown={(e) => { if (e.key === "Enter") joinTournament(); }}
                />
                <Button className="w-full" variant="arcade" onClick={joinTournament}><Swords /> Load Tournament</Button>
                <div className="pt-2 border-t border-border/50" />
                <Input
                  value={joinPlayerName}
                  onChange={(e) => setJoinPlayerName(e.target.value)}
                  placeholder="Your player / team name"
                  onKeyDown={(e) => { if (e.key === "Enter") registerAsPlayer(); }}
                />
                <Button className="w-full" variant="neon" onClick={registerAsPlayer}><Plus /> Register as Player</Button>
                <p className="text-xs text-muted-foreground">Use this to register yourself in a tournament you joined with an ID.</p>
              </div>
            </Panel>

          </aside>

          <section className="space-y-5">
            {selectedTournament ? (
              <>
                <HeroStats tournament={selectedTournament} participants={participants} matches={matches} champion={champion} countdown={activeMatch ? formatTime(countdownSeconds) : "--:--"} />
                {champion && <ChampionBanner champion={champion} />}
                <Tabs defaultValue="bracket" className="space-y-5">
                  <TabsList className="clip-corner grid h-auto grid-cols-4 border border-primary/20 bg-panel/90 p-1">
                    <TabsTrigger value="bracket">Bracket</TabsTrigger>
                    <TabsTrigger value="roster">Roster</TabsTrigger>
                    <TabsTrigger value="scores">Scores</TabsTrigger>
                    <TabsTrigger value="standings">Standings</TabsTrigger>
                  </TabsList>
                  <TabsContent value="bracket"><BracketPanel rounds={rounds} participantMap={participantMap} onGenerate={generateSchedule} canEdit={isOwner} format={selectedTournament.format} /></TabsContent>
                  <TabsContent value="roster"><RosterPanel participants={participants} bulkNames={bulkNames} setBulkNames={setBulkNames} addParticipants={addParticipants} newParticipant={newParticipant} setNewParticipant={setNewParticipant} saveParticipant={saveParticipant} editParticipant={(p) => { setEditingParticipant(p.id); setNewParticipant({ name: p.name, team_name: p.team_name ?? "", logo_url: p.logo_url ?? "" }); }} removeParticipant={removeParticipant} canEdit={isOwner} editing={editingParticipant} /></TabsContent>
                  <TabsContent value="scores"><ScoresPanel matches={matches} participantMap={participantMap} updateScore={updateScore} canEdit={isOwner} /></TabsContent>
                  <TabsContent value="standings"><StandingsPanel standings={standings} /></TabsContent>
                </Tabs>
              </>
            ) : (
              <Panel title="Arena Empty" icon={<Swords className="text-primary" />}><div className="py-16 text-center text-muted-foreground">Create a tournament or open a shared tournament link to start.</div></Panel>
            )}
          </section>
        </div>

        <Panel title="Tournaments" icon={<Trophy className="text-accent" />}>
          <div className="space-y-3">
            <Input
              placeholder="Search by name, code or game..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {!search.trim() && (
              <p className="text-xs text-muted-foreground">Showing your tournaments + last 5 public. Use a Tournament ID to load others.</p>
            )}
            {loading && <div className="clip-corner border border-primary/20 bg-muted/50 p-4 text-muted-foreground">Loading arena data...</div>}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleTournaments.map((tournament) => {
                const mine = user && tournament.owner_id === user.id;
                return (
                  <button key={tournament.id} onClick={() => setSelectedId(tournament.id)} className={`clip-corner w-full border p-3 text-left transition hover:scale-[1.01] ${selectedId === tournament.id ? "border-primary bg-primary/10 shadow-neon" : "border-border bg-panel/70"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <strong className="font-display text-sm uppercase">{tournament.name}</strong>
                      <div className="flex items-center gap-2">
                        {mine && <span className="rounded border border-accent/60 bg-accent/10 px-1.5 py-0.5 text-[10px] font-display uppercase text-accent">Mine</span>}
                        <span className="text-xs text-primary">#{tournament.tournament_code}</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{tournament.game_type} • {tournament.format} • {tournament.status}</p>
                  </button>
                );
              })}
            </div>
            {!loading && visibleTournaments.length === 0 && (
              <div className="clip-corner border border-border bg-panel/40 p-3 text-sm text-muted-foreground">No tournaments match.</div>
            )}
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="clip-corner relative overflow-hidden border border-primary/20 bg-panel p-4 shadow-neon"><div className="absolute inset-x-0 top-0 h-px bg-neon" /><div className="mb-4 flex items-center gap-2 font-display text-sm uppercase text-foreground">{icon}{title}</div>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs uppercase text-muted-foreground">{label}</Label>{children}</div>;
}

function AuthPanel({ authMode, setAuthMode, form, setForm, loading, onSubmit, onGoogle }: any) {
  return <Panel title="Secure Login" icon={<ShieldCheck className="text-primary" />}><form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end"><Field label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="captain@team.gg" /></Field><Field label="Password"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field><Button variant="neon" disabled={loading}>{authMode === "signup" ? "Sign Up" : "Login"}</Button><Button type="button" variant="arcade" onClick={onGoogle}>Google</Button></form><button className="mt-3 text-sm text-primary" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>{authMode === "signup" ? "Already verified? Login" : "New organizer? Create account"}</button></Panel>;
}

function HeroStats({ tournament, participants, matches, champion, countdown }: { tournament: Tournament; participants: Participant[]; matches: Match[]; champion: Participant | null | undefined; countdown: string }) {
  const completed = matches.filter((m) => m.status === "Completed").length;
  return <div className="grid gap-3 md:grid-cols-4"><Stat label="Tournament ID" value={tournament.tournament_code} /><Stat label="Roster" value={`${participants.length}/${tournament.participant_target}`} /><Stat label="Matches" value={`${completed}/${matches.length}`} /><Stat label={champion ? "Champion" : "Next Match"} value={champion?.name ?? countdown} /></div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="clip-corner border border-primary/20 bg-panel p-4"><p className="text-xs uppercase text-muted-foreground">{label}</p><strong className="font-display text-2xl text-primary">{value}</strong></div>;
}

function ChampionBanner({ champion }: { champion: Participant }) {
  return <div className="clip-corner relative overflow-hidden border border-accent/50 bg-neon p-6 text-primary-foreground shadow-pink"><div className="absolute inset-0 animate-scanline bg-gradient-to-b from-transparent via-foreground/20 to-transparent" /><div className="relative flex items-center gap-4"><Trophy className="size-12 animate-pulse-glow" /><div><p className="font-display text-sm uppercase">Winner Declared</p><h2 className="font-display text-3xl font-black uppercase">{champion.name}</h2></div></div></div>;
}

function BracketPanel({ rounds, participantMap, onGenerate, canEdit, format }: any) {
  const roundEntries = Object.entries(rounds) as [string, Match[]][];
  return <Panel title={format === "Knockout" ? "Visual Bracket" : "Round Robin Matrix"} icon={<Swords className="text-primary" />}><div className="mb-4 flex justify-end">{canEdit && <Button variant="neon" onClick={onGenerate}><Swords /> Generate Schedule</Button>}</div>{roundEntries.length ? <div className="flex gap-4 overflow-x-auto pb-3">{roundEntries.map(([round, games]) => <div key={round} className="min-w-64 space-y-3"><h3 className="font-display text-primary">Round {round}</h3>{games.map((match) => <div key={match.id} className="clip-corner border border-border bg-background/60 p-3"><MatchName id={match.participant1_id} map={participantMap} /><div className="my-2 h-px bg-primary/30" /><MatchName id={match.participant2_id} map={participantMap} /><p className="mt-2 text-xs text-muted-foreground">{match.status} • {match.score1}-{match.score2}</p></div>)}</div>)}</div> : <div className="py-12 text-center text-muted-foreground">Generate a schedule to draw the bracket tree.</div>}</Panel>;
}

function MatchName({ id, map }: { id: string | null; map: Map<string, Participant> }) {
  return <div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-sm bg-primary/10 text-primary">{map.get(id ?? "")?.name.charAt(0) ?? "?"}</span><span>{map.get(id ?? "")?.name ?? "TBD"}</span></div>;
}

function RosterPanel(props: any) {
  return <Panel title="Player / Team Management" icon={<Users className="text-primary" />}><div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3"><Textarea value={props.bulkNames} onChange={(e) => props.setBulkNames(e.target.value)} rows={6} placeholder="One player/team per line" />{props.canEdit && <Button variant="neon" onClick={props.addParticipants}><Plus /> Upload List</Button>}<div className="grid gap-2"><Input value={props.newParticipant.name} onChange={(e) => props.setNewParticipant({ ...props.newParticipant, name: e.target.value })} placeholder="Player or team name" /><Input value={props.newParticipant.team_name} onChange={(e) => props.setNewParticipant({ ...props.newParticipant, team_name: e.target.value })} placeholder="Team name optional" /><Input value={props.newParticipant.logo_url} onChange={(e) => props.setNewParticipant({ ...props.newParticipant, logo_url: e.target.value })} placeholder="Logo URL optional" />{props.canEdit && <Button variant="arcade" onClick={props.saveParticipant}>{props.editing ? "Save Edit" : "Add Competitor"}</Button>}</div></div><div className="space-y-2">{props.participants.map((p: Participant) => <div key={p.id} className="clip-corner flex items-center justify-between gap-3 border border-border bg-background/60 p-3"><MatchName id={p.id} map={new Map(props.participants.map((x: Participant) => [x.id, x]))} /><div className="flex gap-1">{props.canEdit && <><Button variant="ghost" size="icon" onClick={() => props.editParticipant(p)}><Pencil /></Button><Button variant="ghost" size="icon" onClick={() => props.removeParticipant(p.id)}><Trash2 /></Button></>}</div></div>)}</div></div></Panel>;
}

function ScoresPanel({ matches, participantMap, updateScore, canEdit }: any) {
  return <Panel title="Live Score Tracking" icon={<Timer className="text-primary" />}><div className="grid gap-3">{matches.map((match: Match) => <ScoreRow key={match.id} match={match} participantMap={participantMap} updateScore={updateScore} canEdit={canEdit} />)}{!matches.length && <div className="py-12 text-center text-muted-foreground">No matches yet.</div>}</div></Panel>;
}

function ScoreRow({ match, participantMap, updateScore, canEdit }: any) {
  const [s1, setS1] = useState(match.score1);
  const [s2, setS2] = useState(match.score2);
  useEffect(() => { setS1(match.score1); setS2(match.score2); }, [match.score1, match.score2]);
  return <div className="clip-corner grid gap-3 border border-border bg-background/60 p-3 md:grid-cols-[1fr_auto_1fr_auto]"><MatchName id={match.participant1_id} map={participantMap} /><div className="flex items-center gap-2"><Input className="w-16" type="number" min={0} value={s1} onChange={(e) => setS1(Number(e.target.value))} /><span className="text-primary">:</span><Input className="w-16" type="number" min={0} value={s2} onChange={(e) => setS2(Number(e.target.value))} /></div><MatchName id={match.participant2_id} map={participantMap} />{canEdit && <Button variant="arcade" onClick={() => updateScore(match, s1, s2)}>Save</Button>}</div>;
}

function StandingsPanel({ standings }: { standings: Participant[] }) {
  return <Panel title="Leaderboard / Points Table" icon={<Trophy className="text-accent" />}><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left"><thead className="text-xs uppercase text-muted-foreground"><tr><th className="p-3">Rank</th><th>Competitor</th><th>Pts</th><th>W</th><th>L</th><th>D</th><th>Diff</th></tr></thead><tbody>{standings.map((p, index) => <tr key={p.id} className="border-t border-border"><td className="p-3 font-display text-primary">#{index + 1}</td><td>{p.name}</td><td>{p.points}</td><td>{p.wins}</td><td>{p.losses}</td><td>{p.draws}</td><td>{p.score_for - p.score_against}</td></tr>)}</tbody></table></div></Panel>;
}
