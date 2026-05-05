import { useState, useRef, useEffect } from "react";
import { Bot, Send, X, MessageCircle, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-bot`;

const SUGGESTIONS = [
  "How do I create a tournament?",
  "What is a Joining ID?",
  "How do I load the demo?",
  "How does scoring work?",
];

export const Chatbot = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "👋 Hey! I'm your **Tournament Assistant**. Ask me anything about creating tournaments, joining IDs, brackets, or scoring!",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (resp.status === 429) {
        toast({ title: "Slow down", description: "Rate limit reached. Try again shortly." });
        setLoading(false);
        return;
      }
      if (resp.status === 402) {
        toast({ title: "Credits exhausted", description: "Add AI credits to continue." });
        setLoading(false);
        return;
      }
      if (!resp.ok || !resp.body) throw new Error("Failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      let done = false;

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) {
              assistant += c;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistant };
                return copy;
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Chatbot error", description: "Could not reach the assistant." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <Button
        variant="neon"
        size="icon"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full z-50 shadow-neon"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open chatbot"
      >
        {open ? <X className="!size-6" /> : <MessageCircle className="!size-6" />}
      </Button>

      {/* Chat panel */}
      <div
        className={cn(
          "fixed bottom-24 right-6 z-50 w-[min(380px,calc(100vw-2rem))] max-h-[calc(100vh-7rem)] h-[520px] flex flex-col rounded-lg border border-primary/40 bg-panel shadow-neon transition-all origin-bottom-right",
          open ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0",
        )}
      >
        <div className="flex items-center gap-2 border-b border-primary/30 p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Bot className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">Tournament Assistant</p>
            <p className="text-xs text-muted-foreground">Powered by AI</p>
          </div>
        </div>

        <ScrollArea className="flex-1 p-3" ref={scrollRef as never}>
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  m.role === "user"
                    ? "ml-auto bg-primary/20 text-foreground"
                    : "mr-auto bg-muted/40 text-foreground",
                )}
              >
                <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                  <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                </div>
              </div>
            ))}
            {loading && messages[messages.length - 1]?.role === "user" && (
              <div className="mr-auto flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <Loader2 className="size-3 animate-spin" /> Thinking…
              </div>
            )}
          </div>
        </ScrollArea>

        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-1.5 border-t border-primary/20 p-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-primary/30 px-2.5 py-1 text-xs text-primary/90 hover:bg-primary/10"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 border-t border-primary/30 p-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={loading}
            className="bg-background/40"
          />
          <Button type="submit" size="icon" variant="neon" disabled={loading || !input.trim()}>
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </form>
      </div>
    </>
  );
};
