import { useState, useCallback, useRef } from "react";
import type { ParseResult, AnalysisResult } from "../types";
import { parseChat } from "../lib/parsers";
import { analyze } from "../lib/engine";
import {
  MessageSquare, Zap, Calendar, AtSign, Settings, CheckSquare, List, Activity,
  ChevronDown, ChevronUp, Copy, Shield, Plus, Check,
  FileText, Clipboard, AlertCircle
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMentions(text: string, names: string[]): React.ReactNode[] {
  if (names.length === 0) return [text];
  const pattern = names.map(escapeRegex).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) => {
    if (names.some((n) => n.toLowerCase() === part.toLowerCase())) {
      return (
        <mark key={i} className="bg-[#F0932B]/30 text-[#F0932B] font-semibold px-0.5 rounded">
          {part}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function PriorityIcon({ p }: { p: string }) {
  switch (p) {
    case "critical": return <AlertCircle className="w-4 h-4 text-[#ef4444]" />;
    case "high": return <Zap className="w-4 h-4 text-[#E8731A]" />;
    case "medium": return <Activity className="w-4 h-4 text-yellow-400" />;
    default: return <MessageSquare className="w-4 h-4 text-[#9a9a9f]" />;
  }
}

function priorityLabel(p: string): string {
  switch (p) {
    case "critical": return "Critical";
    case "high": return "High";
    case "medium": return "Medium";
    default: return "FYI";
  }
}

function formatTime(d: Date | null): string {
  if (!d) return "Unknown";
  return d.toLocaleString();
}

type Tab = "overview" | "important" | "dates" | "mentions" | "chat";

// ─── Subcomponents ──────────────────────────────────────────────────────────────

function ClampedMessage({ text, names, lines = 3 }: { text: string; names: string[]; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.split('\n').length > lines || text.length > lines * 60;
  
  return (
    <div className="mt-2">
      <div className={`text-sm text-[#f2f2f2]/90 whitespace-pre-wrap break-words ${!expanded && isLong ? `line-clamp-${lines}` : ""}`}>
        {highlightMentions(text, names)}
      </div>
      {isLong && (
        <button 
          onClick={() => setExpanded(!expanded)} 
          className="mt-1 text-xs font-semibold text-[#E8731A] hover:text-[#F0932B] flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-[#E8731A] rounded outline-none"
        >
          {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show more</>}
        </button>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function Dashboard() {
  const [phase, setPhase] = useState<"login" | "upload" | "config" | "dashboard">("login");
  const [parsedResult, setParsedResult] = useState<ParseResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [aliases, setAliases] = useState("");
  const [startDateStr, setStartDateStr] = useState("");
  const [endDateStr, setEndDateStr] = useState("");

  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [filterChip, setFilterChip] = useState<"all" | "mentions" | "dates" | "tasks" | "decisions">("all");
  const [showFyi, setShowFyi] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  
  // Track completed items
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const chatRef = useRef<HTMLDivElement>(null);

  const names = [userName, ...aliases.split(",").map((s) => s.trim())].filter(Boolean);

  const handleGoogleLoginClick = () => {
    setShowGoogleModal(true);
  };

  const selectGoogleAccount = (name: string, emailStr: string) => {
    setUserName(name);
    setEmail(emailStr);
    setShowGoogleModal(false);
    setPhase("upload");
  };

  const markCompleted = useCallback((id: string) => {
    setCompletedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setToastMsg("Marked as done");
    setTimeout(() => setToastMsg(null), 2000);
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("File must be under 5 MB.");
      return;
    }
    try {
      setError(null);
      const text = await file.text();
      const result = parseChat(text);
      if (result.messages.length === 0) {
        setError("No messages found.");
        return;
      }
      setParsedResult(result);
      setPhase("config");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file.");
    }
  }, []);

  const handlePaste = useCallback(() => {
    navigator.clipboard.readText().then((text) => {
      if (!text.trim()) {
        setError("Clipboard is empty.");
        return;
      }
      const result = parseChat(text);
      if (result.messages.length === 0) {
        setError("No WhatsApp messages found in clipboard.");
        return;
      }
      setError(null);
      setParsedResult(result);
      setPhase("config");
    }).catch(() => setError("Could not read clipboard."));
  }, []);

  const handleAnalyze = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedResult) return;
    const start = startDateStr ? new Date(startDateStr) : null;
    const end = endDateStr ? new Date(endDateStr) : null;
    if (end) end.setHours(23, 59, 59, 999);

    const result = analyze(parsedResult.messages, names, start, end, new Date());
    setAnalysis(result);
    setPhase("dashboard");
    setActiveTab("overview");
  }, [parsedResult, names, startDateStr, endDateStr]);

  const copyReport = useCallback(() => {
    if (!analysis) return;
    const lines = [
      "=== Report ===",
      `Messages in range: ${analysis.stats.totalInRange}`,
      `Mentions: ${analysis.stats.mentionCount}`,
      `Important: ${analysis.stats.importantCount}`,
      `Action items: ${analysis.stats.actionItemCount}`,
      ""
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setToastMsg("Report copied!");
      setTimeout(() => setToastMsg(null), 2000);
    });
  }, [analysis]);

  const handleNewChat = useCallback(() => {
    setPhase("upload");
    setParsedResult(null);
    setAnalysis(null);
    setError(null);
    setAliases("");
    setStartDateStr("");
    setEndDateStr("");
    setCompletedIds(new Set());
  }, []);

  const resetAll = useCallback(() => {
    setPhase("login");
    setParsedResult(null);
    setAnalysis(null);
    setError(null);
    setUserName("");
    setEmail("");
    setAliases("");
    setStartDateStr("");
    setEndDateStr("");
    setCompletedIds(new Set());
    setShowGoogleModal(false);
  }, []);

  // ─── Render Phases ────────────────────────────────────────────────────────────
  if (phase === "login") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-sans text-[#f2f2f2]" style={{ backgroundColor: "#0a0a0b", backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.03) 0%, transparent 80%)" }}>
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold flex items-center justify-center gap-2 mb-2">
              <MessageSquare className="w-8 h-8 text-[#E8731A]" /> What Did I Miss?
            </h1>
            <p className="text-[#9a9a9f] text-sm">Secure on-device analysis.</p>
          </div>
          <div className="panel-3d p-8 text-center" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000, inset 0 1px 0 rgba(255,255,255,.06)" }}>
            <Shield className="w-10 h-10 text-[#E8731A] mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-1">Verify Identity</h2>
            <p className="text-[#9a9a9f] text-sm mb-8">Please log in securely with Google to analyze your private chats.</p>
            
            <button 
              onClick={handleGoogleLoginClick}
              type="button" 
              className="flex items-center gap-3 bg-white text-black px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-gray-100 transition-colors w-full justify-center"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>

        {showGoogleModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="panel-3d bg-[#1b1b1d] p-6 w-full max-w-sm rounded-2xl border-4 border-[#2a2a2d] shadow-2xl relative">
              <button onClick={() => setShowGoogleModal(false)} className="absolute top-4 right-4 text-[#9a9a9f] hover:text-white">✕</button>
              
              <div className="text-center mb-6">
                <svg className="w-8 h-8 mx-auto mb-3" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <h3 className="text-lg font-bold">Sign in with Google</h3>
                <p className="text-xs text-[#9a9a9f]">Choose an account to continue</p>
              </div>

              <div className="space-y-2">
                <button 
                  onClick={() => selectGoogleAccount("Divyansh Singh", "divyansh.singh@gmail.com")}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[#2a2a2d] transition-colors border border-transparent hover:border-[#47474c] text-left group"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E8731A] to-[#F0932B] flex items-center justify-center font-bold text-black text-lg group-hover:scale-105 transition-transform">
                    D
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">Divyansh Singh</div>
                    <div className="text-xs text-[#9a9a9f]">divyansh.singh@gmail.com</div>
                  </div>
                </button>
                
                <button 
                  onClick={() => selectGoogleAccount("Student", "student@college.edu")}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[#2a2a2d] transition-colors border border-transparent hover:border-[#47474c] text-left group"
                >
                  <div className="w-10 h-10 rounded-full bg-[#2a2a2d] flex items-center justify-center font-bold text-[#9a9a9f] text-lg group-hover:scale-105 transition-transform">
                    S
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">Student</div>
                    <div className="text-xs text-[#9a9a9f]">student@college.edu</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === "upload") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-sans text-[#f2f2f2]" style={{ backgroundColor: "#0a0a0b", backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.03) 0%, transparent 80%)" }}>
        <div className="max-w-lg w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold flex items-center justify-center gap-2 mb-2">
              <MessageSquare className="w-8 h-8 text-[#E8731A]" /> What Did I Miss?
            </h1>
            <p className="text-[#9a9a9f] text-sm">Signed in as {email}</p>
          </div>
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2" role="alert" aria-live="polite">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
          <div className="panel-3d p-8 text-center" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000, inset 0 1px 0 rgba(255,255,255,.06)" }}>
            <FileText className="w-12 h-12 text-[#9a9a9f] mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Upload Chat Export</h2>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
              <label className="btn-3d flex items-center justify-center gap-2 bg-gradient-to-r from-[#E8731A] to-[#F0932B] text-black font-semibold px-6 py-3" style={{ borderColor: "#F0932B", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
                <FileText className="w-4 h-4" /> Select .txt File
                <input type="file" accept=".txt" className="sr-only" onChange={handleFileUpload} />
              </label>
              <button onClick={handlePaste} className="btn-3d flex items-center justify-center gap-2 text-white px-6 py-3" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
                <Clipboard className="w-4 h-4 text-[#9a9a9f]" /> Paste from Clipboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "config" && parsedResult) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-sans text-[#f2f2f2]" style={{ backgroundColor: "#0a0a0b", backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.03) 0%, transparent 80%)" }}>
        <div className="max-w-lg w-full panel-3d p-6 md:p-8" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000, inset 0 1px 0 rgba(255,255,255,.06)" }}>
          <div className="text-center mb-6 pb-6 border-b border-[#2a2a2d]">
            <CheckSquare className="w-10 h-10 text-[#22c55e] mx-auto mb-2" />
            <h2 className="text-xl font-bold text-white">Parsed {parsedResult.messages.length} Messages</h2>
          </div>
          <form onSubmit={handleAnalyze} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-1 text-white">Aliases / Phone</label>
              <input type="text" value={aliases} onChange={e => setAliases(e.target.value)} placeholder="e.g. Divy, +91..."
                className="w-full rounded bg-[#1b1b1d] border border-[#2a2a2d] text-white px-4 py-2 focus:ring-2 focus:ring-[#E8731A] outline-none" />
              <p className="text-xs text-[#9a9a9f] mt-1">We'll use these along with your name ({userName}) to find mentions.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1 text-white">Start Date <span className="text-[#9a9a9f] font-normal">(Optional)</span></label>
                <input type="date" value={startDateStr} onChange={e => setStartDateStr(e.target.value)}
                  className="w-full rounded bg-[#1b1b1d] border border-[#2a2a2d] text-white px-4 py-2 focus:ring-2 focus:ring-[#E8731A] outline-none" style={{ colorScheme: "dark" }} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-white">End Date <span className="text-[#9a9a9f] font-normal">(Optional)</span></label>
                <input type="date" value={endDateStr} onChange={e => setEndDateStr(e.target.value)}
                  className="w-full rounded bg-[#1b1b1d] border border-[#2a2a2d] text-white px-4 py-2 focus:ring-2 focus:ring-[#E8731A] outline-none" style={{ colorScheme: "dark" }} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={resetAll} className="btn-3d flex-1 py-3 font-medium text-[#9a9a9f] hover:text-white" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>Back</button>
              <button type="submit" className="btn-3d flex-1 bg-gradient-to-r from-[#E8731A] to-[#F0932B] text-black font-semibold py-3" style={{ borderColor: "#F0932B", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>Analyze</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (phase !== "dashboard" || !analysis) return null;

  const { stats, scored, mentionMessages, extractedDates, nextMeeting, filtered } = analysis;
  
  const filteredScored = scored.filter((s) => {
    if (completedIds.has(s.id)) return false;
    if (!showFyi && s.priority === "fyi") return false;
    if (filterChip === "mentions") return s.reasons.includes("mention");
    if (filterChip === "dates") return s.reasons.includes("date");
    if (filterChip === "tasks") return s.reasons.includes("task");
    if (filterChip === "decisions") return s.reasons.includes("decision");
    return true;
  });

  const nextMeetingSrc = nextMeeting && !completedIds.has(nextMeeting.messageId) ? filtered.find((m) => m.id === nextMeeting.messageId) : null;
  const filteredDates = extractedDates.filter(d => !completedIds.has(d.messageId));
  const filteredMentions = mentionMessages.filter(m => !completedIds.has(m.id));

  const activeImportantCount = scored.filter(s => s.priority !== "fyi" && !completedIds.has(s.id)).length;
  const activeDateCount = filteredDates.filter(d => !d.overdue).length;
  const activeMentionCount = filteredMentions.length;
  const activeActionCount = scored.filter(s => s.reasons.includes("task") && !completedIds.has(s.id)).length;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "overview", label: "Overview", icon: <List className="w-4 h-4" /> },
    { id: "important", label: "Important", icon: <Zap className="w-4 h-4" />, count: activeImportantCount },
    { id: "dates", label: "Dates", icon: <Calendar className="w-4 h-4" />, count: activeDateCount },
    { id: "mentions", label: "Mentions", icon: <AtSign className="w-4 h-4" />, count: activeMentionCount },
    { id: "chat", label: "Chat", icon: <MessageSquare className="w-4 h-4" /> },
  ];

  const StatCard = ({ label, value, icon, target, chainH }: { label: string; value: number; icon: React.ReactNode; target: Tab; chainH: number }) => (
    <div className="relative pt-[var(--chain-h)] swing-hover" style={{ "--chain-h": `${chainH}px` } as React.CSSProperties}>
      <div className="absolute top-0 left-[15%] w-4 h-full chain-bg" />
      <div className="absolute top-0 right-[15%] w-4 h-full chain-bg" />
      <button 
        onClick={() => setActiveTab(target)}
        className="panel-3d w-full p-4 relative z-10 flex flex-col items-center focus-visible:ring-2 focus-visible:ring-[#E8731A] outline-none text-left"
        style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000, inset 0 1px 0 rgba(255,255,255,.06)" }}
      >
        <div className="flex items-center gap-1.5 text-[#9a9a9f] text-xs font-bold uppercase tracking-wider mb-2">
          {icon} {label}
        </div>
        <div className="text-3xl font-extrabold text-[#E8731A] tabular-nums">{value}</div>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen font-sans text-[#f2f2f2] flex flex-col md:flex-row" style={{ backgroundColor: "#0a0a0b", backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.03) 0%, transparent 80%)" }}>
      {/* ─── SIDEBAR ───────────────────────────────────────────────────────── */}
      <nav className="w-full md:w-80 p-6 flex flex-col gap-4 shrink-0 border-b-2 md:border-b-0 md:border-r-2 border-[#47474c] bg-[#0a0a0b]/40 backdrop-blur-md md:sticky md:top-0 md:h-screen md:overflow-y-auto scrollbar-hide" role="tablist" aria-label="Dashboard sections">
        <div className="flex items-center gap-3 mb-4 md:mb-8 px-2 shrink-0">
          <MessageSquare className="w-8 h-8 text-[#E8731A]" />
          <span className="font-extrabold tracking-tight text-xl">What Did I Miss?</span>
        </div>
        
        <div className="flex md:flex-col gap-4 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={`btn-3d flex items-center justify-between px-6 py-4 shrink-0 md:shrink font-bold focus-visible:ring-2 focus-visible:ring-[#E8731A] outline-none !rounded-full transition-all text-base ${
                activeTab === t.id 
                  ? "bg-gradient-to-r from-[#E8731A] to-[#F0932B] text-black shadow-[0_0_15px_rgba(232,115,26,0.3)]"
                  : "text-[#9a9a9f] hover:text-white"
              }`}
              style={{
                borderColor: "#8d8d93 #47474c #47474c #8d8d93",
                borderStyle: "solid", borderWidth: "3px", boxShadow: "4px 6px 0 #000"
              }}
            >
              <div className="flex items-center gap-3">
                {t.icon} {t.label}
              </div>
              {t.count !== undefined && (
                <span className={`text-sm px-3 py-0.5 rounded-full font-bold ${activeTab === t.id ? "bg-black/20 text-black" : "bg-[#2a2a2d] text-[#9a9a9f]"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-auto hidden md:flex flex-col gap-4 pt-8 border-t-2 border-[#47474c]">
          {userName && (
            <div className="flex items-center gap-3 px-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E8731A] to-[#F0932B] flex items-center justify-center font-bold text-black text-lg shadow-lg shrink-0">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <div className="font-bold text-white text-sm truncate">{userName}</div>
                <div className="text-xs text-[#9a9a9f] truncate">{email}</div>
              </div>
            </div>
          )}
          
          <div className="panel-3d px-4 py-3 text-sm font-bold text-center flex items-center justify-center gap-2 text-[#22c55e]" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
            <Shield className="w-4 h-4" />
            100% on-device
          </div>
          <div className="flex gap-2">
            <button onClick={handleNewChat} className="btn-3d flex-1 px-2 py-3 text-sm font-bold flex items-center justify-center gap-2 text-white bg-gradient-to-r from-[#E8731A] to-[#F0932B] focus-visible:ring-2 focus-visible:ring-[#E8731A] outline-none" style={{ borderColor: "#F0932B", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
              <Plus className="w-4 h-4 text-black" /> <span className="text-black">New Chat</span>
            </button>
            <button onClick={resetAll} className="btn-3d flex-1 px-2 py-3 text-xs font-bold flex items-center justify-center gap-1 text-[#9a9a9f] hover:text-white focus-visible:ring-2 focus-visible:ring-[#E8731A] outline-none" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
              Log Out
            </button>
          </div>
        </div>
      </nav>

      {/* ─── MAIN AREA ─────────────────────────────────────────────────────── */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto w-full" role="tabpanel">
        <div aria-live="polite" className="fixed bottom-4 right-4 bg-[#22c55e] text-white px-4 py-2 rounded-lg shadow-lg font-bold transition-opacity duration-300" style={{ opacity: toastMsg ? 1 : 0, pointerEvents: 'none', zIndex: 50 }}>
          {toastMsg}
        </div>
        
        {/* Header row */}
        <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <button onClick={() => setPhase("config")} className="btn-3d px-4 py-2 text-xs font-medium text-[#9a9a9f] hover:text-white flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-[#E8731A] outline-none" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
            <Settings className="w-4 h-4" /> Change settings
          </button>
          <div className="flex items-center gap-4">
            <button onClick={copyReport} className="btn-3d px-4 py-2 text-xs font-bold flex items-center gap-2 text-[#9a9a9f] hover:text-white focus-visible:ring-2 focus-visible:ring-[#E8731A] outline-none" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
              <Copy className="w-4 h-4" /> Copy report
            </button>
          </div>
        </header>

        {/* ─── OVERVIEW TAB ──────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-8 pb-12">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="Messages" value={stats.totalInRange} icon={<MessageSquare className="w-4 h-4" />} target="chat" chainH={40} />
              <StatCard label="Mentions" value={activeMentionCount} icon={<AtSign className="w-4 h-4" />} target="mentions" chainH={90} />
              <StatCard label="Important" value={activeImportantCount} icon={<Zap className="w-4 h-4" />} target="important" chainH={50} />
              <StatCard label="Dates" value={activeDateCount} icon={<Calendar className="w-4 h-4" />} target="dates" chainH={80} />
              <StatCard label="Action Items" value={activeActionCount} icon={<CheckSquare className="w-4 h-4" />} target="important" chainH={40} />
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="panel-3d p-6" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000, inset 0 1px 0 rgba(255,255,255,.06)" }}>
                <h3 className="text-xs font-bold text-[#9a9a9f] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Next Meeting
                </h3>
                {nextMeeting ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="text-xl font-bold text-white mb-2">{formatTime(nextMeeting.date)}</div>
                      <button onClick={() => markCompleted(nextMeeting.messageId)} className="btn-3d px-3 py-1 text-xs font-bold flex items-center gap-1 text-[#9a9a9f] hover:text-[#22c55e]" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
                        <Check className="w-3 h-3" /> Done
                      </button>
                    </div>
                    {nextMeetingSrc && (
                      <div className="bg-[#0a0a0b]/50 p-3 rounded-lg border border-[#2a2a2d] mt-2 max-w-2xl">
                        <ClampedMessage text={nextMeetingSrc.text} names={names} lines={2} />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[#9a9a9f] text-sm italic">No upcoming meetings found.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── IMPORTANT TAB ─────────────────────────────────────────────── */}
        {activeTab === "important" && (
          <div className="space-y-6 pb-12">
            <div className="flex flex-wrap gap-2 items-center">
              {(["all", "mentions", "dates", "tasks", "decisions"] as const).map(chip => (
                <button key={chip} onClick={() => setFilterChip(chip)}
                  className={`btn-3d px-4 py-2 text-xs font-bold uppercase tracking-wider focus-visible:ring-2 focus-visible:ring-[#E8731A] outline-none ${
                    filterChip === chip ? "bg-[#E8731A]/20 text-[#E8731A] border-[#E8731A]/50" : "text-[#9a9a9f] hover:text-white"
                  }`} style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: filterChip === chip ? "#E8731A #E8731A #E8731A #E8731A" : "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
                  {chip}
                </button>
              ))}
              <label className="flex items-center gap-2 ml-auto text-xs font-bold text-[#9a9a9f] uppercase cursor-pointer">
                <input type="checkbox" checked={showFyi} onChange={e => setShowFyi(e.target.checked)} className="rounded border-[#2a2a2d] accent-[#E8731A]" />
                Show FYI
              </label>
            </div>
            
            <div className="space-y-4">
              {filteredScored.length === 0 && <p className="text-center text-[#9a9a9f] italic py-8">No messages match this filter.</p>}
              {filteredScored.map(m => (
                <div key={m.id} className="panel-3d p-5" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000, inset 0 1px 0 rgba(255,255,255,.06)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0a0a0b] text-[10px] font-bold uppercase tracking-wider border border-[#2a2a2d]">
                        <PriorityIcon p={m.priority} /> {priorityLabel(m.priority)}
                      </span>
                      <span className="font-bold">{m.sender}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#9a9a9f]">{formatTime(m.ts)}</span>
                      <button onClick={() => markCompleted(m.id)} className="btn-3d px-3 py-1 text-xs font-bold flex items-center gap-1 text-[#9a9a9f] hover:text-[#22c55e]" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
                        <Check className="w-3 h-3" /> Done
                      </button>
                    </div>
                  </div>
                  <ClampedMessage text={m.text} names={names} lines={4} />
                  {m.reasons.length > 0 && (
                    <div className="mt-3 text-[10px] text-[#9a9a9f] uppercase font-semibold tracking-wider">
                      Why flagged: {m.reasons.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── DATES TAB ─────────────────────────────────────────────────── */}
        {activeTab === "dates" && (
          <div className="space-y-4 pb-12">
            {filteredDates.length === 0 && <p className="text-center text-[#9a9a9f] italic py-8">No dates found.</p>}
            {filteredDates.map((d, i) => {
              const src = filtered.find(m => m.id === d.messageId);
              return (
                <div key={i} className="panel-3d p-5 flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: d.overdue ? "#ef4444 #ef4444 #ef4444 #ef4444" : "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000, inset 0 1px 0 rgba(255,255,255,.06)" }}>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 rounded bg-[#0a0a0b] text-[10px] font-bold uppercase tracking-wider text-[#E8731A] border border-[#2a2a2d]">
                        {d.type}
                      </span>
                      {d.overdue && <span className="px-2 py-1 rounded bg-red-500/10 text-[10px] font-bold uppercase tracking-wider text-[#ef4444] border border-red-500/30">Overdue</span>}
                      <span className="font-bold">{formatTime(d.date)}</span>
                    </div>
                    {src && <p className="text-sm text-[#f2f2f2]/80 line-clamp-2">{src.text}</p>}
                  </div>
                  {src && (
                    <div className="flex gap-2">
                      <button onClick={() => markCompleted(d.messageId)} className="btn-3d px-4 py-2 text-xs font-bold text-[#9a9a9f] hover:text-[#22c55e] whitespace-nowrap flex items-center gap-1" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
                        <Check className="w-3 h-3" /> Done
                      </button>
                      <button onClick={() => setActiveTab("chat")} className="btn-3d px-4 py-2 text-xs font-bold text-[#9a9a9f] hover:text-white whitespace-nowrap" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
                        Jump to chat
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── MENTIONS TAB ──────────────────────────────────────────────── */}
        {activeTab === "mentions" && (
          <div className="space-y-4 pb-12">
            {filteredMentions.length === 0 && <p className="text-center text-[#9a9a9f] italic py-8">No mentions found.</p>}
            {filteredMentions.map(m => (
              <div key={m.id} className="panel-3d p-5" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000, inset 0 1px 0 rgba(255,255,255,.06)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">{m.sender}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#9a9a9f]">{formatTime(m.ts)}</span>
                    <button onClick={() => markCompleted(m.id)} className="btn-3d px-3 py-1 text-xs font-bold flex items-center gap-1 text-[#9a9a9f] hover:text-[#22c55e]" style={{ background: "linear-gradient(to bottom, #1b1b1d, #141415)", borderColor: "#8d8d93 #47474c #47474c #8d8d93", borderStyle: "solid", borderWidth: "3px", borderRadius: "12px", boxShadow: "4px 6px 0 #000" }}>
                      <Check className="w-3 h-3" /> Done
                    </button>
                  </div>
                </div>
                <ClampedMessage text={m.text} names={names} lines={4} />
              </div>
            ))}
          </div>
        )}

        {/* ─── CHAT TAB ──────────────────────────────────────────────────── */}
        {activeTab === "chat" && (
          <div className="space-y-3 pb-12" ref={chatRef}>
            {filtered.map(m => {
              const isImportant = scored.some(s => s.id === m.id && s.priority !== "fyi");
              const isOwn = names.some(n => m.sender.toLowerCase() === n.toLowerCase());
              return (
                <div key={m.id} className={`p-4 rounded-xl text-sm border-2 ${
                  isOwn ? "bg-[#1b1b1d] border-[#2a2a2d] ml-12" : "bg-[#141415] border-[#2a2a2d] mr-12"
                } ${isImportant ? "border-l-[#E8731A]" : ""}`}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className={`font-bold text-xs ${isOwn ? "text-[#E8731A]" : "text-[#9a9a9f]"}`}>{m.sender}</span>
                    <span className="text-[10px] text-[#9a9a9f]">{formatTime(m.ts)}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words">{highlightMentions(m.text, names)}</div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
