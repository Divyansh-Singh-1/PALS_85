import { useState } from "react";
import { Upload, FileText, Calendar, MessageSquare, AlertCircle, Users } from "lucide-react";
import type { ParseResult, Message } from "../types";
import { parseChat } from "../lib/parsers";
import { readFileContent } from "../lib/parsers/fileParser";
import { analyzeMessages, type AnalysisResult } from "../lib/analyzer";

export function Dashboard() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [parsedResult, setParsedResult] = useState<ParseResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // Form state
  const [userName, setUserName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Tab state
  const [activeTab, setActiveTab] = useState<"meetings" | "dates" | "all">("meetings");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      setError(null);
      const text = await readFileContent(file);
      const result = parseChat(text);
      if (result.messages.length === 0) {
        setError("No messages could be parsed from this file. Ensure it's a valid WhatsApp export.");
        setIsProcessing(false);
        return;
      }
      setParsedResult(result);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedResult) return;

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const result = analyzeMessages(parsedResult.messages, start, end);
    setAnalysis(result);
    setStep(3);
  };

  const renderMessageText = (text: string) => {
    if (!userName.trim()) return <span>{text}</span>;
    
    // Highlight user name (case-insensitive)
    const regex = new RegExp(`(${userName})`, "gi");
    const parts = text.split(regex);
    
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === userName.toLowerCase() ? (
            <mark key={i} className="bg-yellow-200 text-yellow-900 font-medium px-1 rounded">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  const renderMessageList = (messages: Message[], emptyMsg: string) => {
    if (messages.length === 0) {
      return <div className="text-gray-500 italic p-4 text-center border rounded-lg bg-gray-50">{emptyMsg}</div>;
    }

    return (
      <div className="space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex gap-4">
            <div className="flex-shrink-0 mt-1">
              <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                {msg.sender.charAt(0).toUpperCase()}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <span className="font-semibold text-gray-900">{msg.sender}</span>
                <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                  {msg.ts ? msg.ts.toLocaleString() : "Unknown time"}
                </span>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap break-words">
                {renderMessageText(msg.text)}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-2 flex items-center justify-center gap-2">
          <MessageSquare className="text-indigo-600" /> What Did I Miss?
        </h1>
        <p className="text-gray-500 max-w-2xl mx-auto">
          Local-first chat analyzer. Extract important meetings and deadlines from your messy chat exports securely in your browser.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 text-center">
          <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
            <Upload className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Upload Chat Export</h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Upload a .txt file exported from WhatsApp, or a .pdf log. Data never leaves your device.
          </p>
          
          <label className="inline-flex cursor-pointer bg-indigo-600 text-white font-medium px-6 py-3 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors">
            {isProcessing ? "Processing..." : "Select File"}
            <input 
              type="file" 
              accept=".txt,.pdf" 
              className="hidden" 
              onChange={handleFileUpload} 
              disabled={isProcessing}
            />
          </label>
        </div>
      )}

      {/* Step 2: Configuration */}
      {step === 2 && parsedResult && (
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-200 max-w-2xl mx-auto">
          <div className="mb-6 pb-6 border-b border-gray-100 text-center">
            <div className="inline-flex items-center justify-center p-2 bg-green-100 text-green-700 rounded-full mb-3">
              <FileText className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Successfully Parsed</h2>
            <p className="text-gray-500">Found {parsedResult.messages.length} messages.</p>
          </div>

          <form onSubmit={handleAnalyze} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" /> Your Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. John"
                className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">We'll highlight messages mentioning you.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-500" /> Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-500" /> End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border-gray-300 border px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setParsedResult(null);
                }}
                className="flex-1 bg-gray-100 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                className="flex-1 bg-indigo-600 text-white font-medium py-3 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
              >
                Analyze Chat
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 3: Dashboard */}
      {step === 3 && analysis && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="text-sm text-gray-600">
              Analyzing <span className="font-bold text-gray-900">{analysis.filteredMessages.length}</span> messages
              {userName && <span> | Highlighting mentions of <span className="font-bold text-indigo-600">{userName}</span></span>}
            </div>
            <button
              onClick={() => setStep(2)}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Change Settings
            </button>
          </div>

          <div className="flex border-b border-gray-200 gap-6">
            <button
              onClick={() => setActiveTab("meetings")}
              className={`pb-3 font-semibold text-sm transition-colors relative ${
                activeTab === "meetings" ? "text-indigo-600" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Important Meetings ({analysis.importantMeetings.length})
              {activeTab === "meetings" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t"></span>}
            </button>
            <button
              onClick={() => setActiveTab("dates")}
              className={`pb-3 font-semibold text-sm transition-colors relative ${
                activeTab === "dates" ? "text-indigo-600" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Important Dates ({analysis.importantDates.length})
              {activeTab === "dates" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t"></span>}
            </button>
            <button
              onClick={() => setActiveTab("all")}
              className={`pb-3 font-semibold text-sm transition-colors relative ${
                activeTab === "all" ? "text-indigo-600" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              All Messages ({analysis.filteredMessages.length})
              {activeTab === "all" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t"></span>}
            </button>
          </div>

          <div className="mt-6">
            {activeTab === "meetings" && renderMessageList(analysis.importantMeetings, "No meetings found in this date range.")}
            {activeTab === "dates" && renderMessageList(analysis.importantDates, "No important dates or deadlines found in this date range.")}
            {activeTab === "all" && renderMessageList(analysis.filteredMessages, "No messages match your filters.")}
          </div>
        </div>
      )}
    </div>
  );
}
