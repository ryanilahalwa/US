import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Archive, CalendarClock, Check, Clock3, Download, Heart, ListChecks, Loader2, Mic, MicOff, RotateCw, Sparkles, Star, TrendingUp, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import OrbitChaptersPage from "./OrbitChaptersPage";
import OrbitKeepsakesPage from "./OrbitKeepsakesPage";

type HubTab = "plans" | "timeline" | "countdowns" | "voice" | "insights" | "chapters" | "keepsakes";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`glass-card ${className}`}>{children}</section>;
}

function dateLabel(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function countdownLabel(target: Date | string) {
  const remaining = new Date(target).getTime() - Date.now();
  if (remaining <= 0) return "Arrived";
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${days}d ${hours}h ${minutes}m`;
}

function PlansPanel() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const items = trpc.orbit.bucket.list.useQuery();
  const create = trpc.orbit.bucket.create.useMutation();
  const toggle = trpc.orbit.bucket.toggle.useMutation();
  const remove = trpc.orbit.bucket.remove.useMutation();
  const [title, setTitle] = useState(() => localStorage.getItem("orbit-bucket-draft-title") ?? "");
  const [note, setNote] = useState(() => localStorage.getItem("orbit-bucket-draft-note") ?? "");
  const [targetDate, setTargetDate] = useState("");
  useEffect(() => { localStorage.setItem("orbit-bucket-draft-title", title); localStorage.setItem("orbit-bucket-draft-note", note); }, [title, note]);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!title.trim()) return; await create.mutateAsync({ title, note: note || undefined, targetDate: targetDate || undefined, category: "together" }); await utils.orbit.bucket.list.invalidate(); setTitle(""); setNote(""); setTargetDate(""); localStorage.removeItem("orbit-bucket-draft-title"); localStorage.removeItem("orbit-bucket-draft-note"); toast.success("Added to your shared plans."); };
  return <div className="feature-grid"><Card><div className="eyebrow"><ListChecks size={14} /> SHARED BUCKET LIST</div><h3>Things we want to do</h3><p>Ideas, places, meals, and little adventures can live here until they become memories.</p><form className="form-stack" onSubmit={submit}><label>Idea<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Watch the sunrise together" required /></label><label>Note <span>(optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="A detail to remember" /></label><label>Target date <span>(optional)</span><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label><button className="primary-button" disabled={create.isPending}>{create.isPending ? <Loader2 className="spin" size={16} /> : "Add to our list"}<Heart size={15} /></button></form><small className="offline-note"><Archive size={13} /> Drafts are kept on this device if you lose connection.</small></Card><Card><div className="panel-heading"><div><span className="eyebrow">OUR NEXT THINGS</span><h3>{items.data?.filter(({ item }) => !item.completedAt).length ?? 0} still to come</h3></div><Sparkles size={19} /></div><div className="feature-list">{items.data?.length ? items.data.map(({ item, authorName }) => <div className={`feature-row ${item.completedAt ? "completed" : ""}`} key={item.id}><button className="check-button" onClick={async () => { await toggle.mutateAsync({ id: item.id, completed: !item.completedAt }); await utils.orbit.bucket.list.invalidate(); }} aria-label={item.completedAt ? "Mark as unfinished" : "Mark as complete"}><Check size={15} /></button><div><b>{item.title}</b><small>{item.note || "A plan for us"} · {authorName ?? "You"}{item.targetDate ? ` · ${dateLabel(item.targetDate)}` : ""}</small></div>{item.createdById === user?.id && <button className="quiet-delete" onClick={async () => { await remove.mutateAsync({ id: item.id }); await utils.orbit.bucket.list.invalidate(); }}>Remove</button>}</div>) : <div className="empty-inline"><ListChecks size={20} /><span>Add the first thing you want to do together.</span></div>}</div></Card></div>;
}

function TimelinePanel() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const events = trpc.orbit.timeline.list.useQuery();
  const create = trpc.orbit.timeline.create.useMutation();
  const remove = trpc.orbit.timeline.remove.useMutation();
  const [title, setTitle] = useState(""); const [note, setNote] = useState(""); const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const submit = async (event: React.FormEvent) => { event.preventDefault(); await create.mutateAsync({ title, note: note || undefined, eventDate: new Date(`${eventDate}T12:00:00`) }); await utils.orbit.timeline.list.invalidate(); setTitle(""); setNote(""); toast.success("Milestone added to your timeline."); };
  return <div className="feature-grid"><Card><div className="eyebrow"><Star size={14} /> RELATIONSHIP TIMELINE</div><h3>Mark what matters</h3><p>Keep the beginning, the turning points, and the ordinary days that became important.</p><form className="form-stack" onSubmit={submit}><label>Milestone<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Our first trip" required /></label><label>Date<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required /></label><label>Note <span>(optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={800} /></label><button className="primary-button" disabled={create.isPending}>{create.isPending ? <Loader2 className="spin" size={16} /> : "Add milestone"}<Star size={15} /></button></form></Card><Card><div className="eyebrow"><Clock3 size={14} /> OUR STORY SO FAR</div><h3>Timeline</h3><div className="timeline-list">{events.data?.length ? events.data.map(({ event, authorName }) => <div className="timeline-item" key={event.id}><span className="timeline-dot" /><div><small>{dateLabel(event.eventDate)} · {authorName ?? "You"}</small><b>{event.title}</b>{event.note && <p>{event.note}</p>}</div>{event.createdById === user?.id && <button className="quiet-delete" onClick={async () => { await remove.mutateAsync({ id: event.id }); await utils.orbit.timeline.list.invalidate(); }}>Remove</button>}</div>) : <div className="empty-inline"><Clock3 size={20} /><span>Your shared timeline begins with the first milestone.</span></div>}</div></Card></div>;
}

function CountdownsPanel() {
  const utils = trpc.useUtils();
  const countdowns = trpc.orbit.countdowns.list.useQuery();
  const create = trpc.orbit.countdowns.create.useMutation();
  const complete = trpc.orbit.countdowns.complete.useMutation();
  const remove = trpc.orbit.countdowns.remove.useMutation();
  const [, refresh] = useState(0);
  const [title, setTitle] = useState(""); const [targetAt, setTargetAt] = useState(""); const [note, setNote] = useState(""); const [reminderEnabled, setReminderEnabled] = useState(true);
  useEffect(() => { const id = window.setInterval(() => refresh((value) => value + 1), 60_000); return () => window.clearInterval(id); }, []);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); await create.mutateAsync({ title, note: note || undefined, targetAt: new Date(targetAt), reminderEnabled }); await utils.orbit.countdowns.list.invalidate(); setTitle(""); setNote(""); setTargetAt(""); toast.success("Countdown added to your orbit."); };
  return <div className="feature-grid"><Card><div className="eyebrow"><CalendarClock size={14} /> SHARED COUNTDOWNS</div><h3>Something to look forward to</h3><p>Trips, birthdays, anniversaries, and the next small thing that makes waiting feel sweet.</p><form className="form-stack" onSubmit={submit}><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Our next weekend away" required /></label><label>Target date and time<input type="datetime-local" value={targetAt} onChange={(event) => setTargetAt(event.target.value)} required /></label><label>Note <span>(optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></label><label className="check-row"><input type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} /><span>Show an in-app reminder when it arrives</span></label><button className="primary-button" disabled={create.isPending}>{create.isPending ? <Loader2 className="spin" size={16} /> : "Start countdown"}<CalendarClock size={15} /></button></form></Card><Card><div className="eyebrow"><Clock3 size={14} /> COUNTING DOWN</div><div className="countdown-list">{countdowns.data?.length ? countdowns.data.map(({ countdown }) => <div className={`countdown-card ${countdown.completedAt ? "completed" : ""}`} key={countdown.id}><div><b>{countdown.title}</b><small>{countdown.note || "A moment on the horizon"}</small></div><strong>{countdown.completedAt ? "Complete" : countdownLabel(countdown.targetAt)}</strong><div className="record-actions"><button className="secondary-button" onClick={async () => { await complete.mutateAsync({ id: countdown.id, completed: !countdown.completedAt }); await utils.orbit.countdowns.list.invalidate(); }}>{countdown.completedAt ? "Reopen" : "Done"}</button><button className="quiet-delete" onClick={async () => { await remove.mutateAsync({ id: countdown.id }); await utils.orbit.countdowns.list.invalidate(); }}>Remove</button></div></div>) : <div className="empty-inline"><CalendarClock size={20} /><span>Create a countdown for the next thing you are excited about.</span></div>}</div></Card></div>;
}

function VoicePanel() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const memories = trpc.orbit.voice.list.useQuery();
  const prepare = trpc.orbit.voice.prepareUpload.useMutation();
  const create = trpc.orbit.voice.create.useMutation();
  const remove = trpc.orbit.voice.remove.useMutation();
  const recorderRef = useRef<MediaRecorder | null>(null); const streamRef = useRef<MediaStream | null>(null); const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false); const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null); const [caption, setCaption] = useState(""); const [visibility, setVisibility] = useState<"pair" | "private">("pair");
  const start = async () => { if (!navigator.mediaDevices?.getUserMedia) return toast.error("This browser cannot record audio."); try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream; chunksRef.current = []; const recorder = new MediaRecorder(stream); recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); }; recorder.onstop = () => { setVoiceBlob(new Blob(chunksRef.current, { type: "audio/webm" })); stream.getTracks().forEach((track) => track.stop()); }; recorderRef.current = recorder; recorder.start(); setRecording(true); } catch { toast.error("Microphone permission is needed for a voice memory."); } };
  const stop = () => { recorderRef.current?.stop(); recorderRef.current = null; setRecording(false); streamRef.current?.getTracks().forEach((track) => track.stop()); };
  const save = async () => { if (!voiceBlob) return; try { const filename = `voice-${Date.now()}.webm`; const prepared = await prepare.mutateAsync({ filename, mimeType: "audio/webm" }); const uploadForm = new FormData(); uploadForm.append("file", voiceBlob, filename); Object.entries(prepared.uploadParams).forEach(([key, value]) => uploadForm.append(key, value)); const uploaded = await fetch(prepared.uploadUrl, { method: "POST", body: uploadForm }); if (!uploaded.ok) throw new Error("The voice file could not be uploaded to Cloudinary."); await create.mutateAsync({ filename, fileKey: prepared.key, mediaUrl: prepared.url, caption: caption || undefined, occurredAt: new Date(), visibility }); await utils.orbit.voice.list.invalidate(); setVoiceBlob(null); setCaption(""); toast.success("Voice memory saved privately."); } catch (error) { toast.error(error instanceof Error ? error.message : "The voice memory could not be saved."); } };
  return <div className="feature-grid"><Card><div className="eyebrow"><Mic size={14} /> VOICE MEMORIES</div><h3>Keep the sound of the moment</h3><p>Record a short message, a laugh, or a goodnight. Your browser will ask for microphone permission first.</p><div className="recording-panel">{recording ? <button className="danger-button" onClick={stop}><MicOff size={17} /> Stop recording</button> : <button className="primary-button" onClick={start}><Mic size={17} /> Record voice memory</button>}{voiceBlob && <><audio controls src={URL.createObjectURL(voiceBlob)} /><label>Caption <span>(optional)</span><input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} placeholder="What should this sound remind us of?" /></label><label>Privacy<select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="pair">Visible to both of us</option><option value="private">Private to me</option></select></label><button className="secondary-button" onClick={save} disabled={prepare.isPending || create.isPending}>{prepare.isPending || create.isPending ? <Loader2 className="spin" size={15} /> : "Save voice memory"}<Heart size={15} /></button></>}</div></Card><Card><div className="eyebrow"><Volume2 size={14} /> SHARED VOICE</div><div className="voice-list">{memories.data?.length ? memories.data.map(({ voice, authorName }) => <div className="voice-row" key={voice.id}><audio controls src={voice.mediaUrl} /><div><b>{voice.caption || "A voice memory"}</b><small>{dateLabel(voice.occurredAt)} · {authorName ?? "You"}</small></div>{voice.createdById === user?.id && <button className="quiet-delete" onClick={async () => { await remove.mutateAsync({ id: voice.id }); await utils.orbit.voice.list.invalidate(); }}>Remove</button>}</div>) : <div className="empty-inline"><Volume2 size={20} /><span>No voice memories yet.</span></div>}</div></Card></div>;
}

function InsightsPanel() {
  const trends = trpc.orbit.insights.trends.useQuery();
  const stats = trpc.orbit.moments.stats.useQuery();
  const exportQuery = trpc.orbit.exportData.useQuery(undefined, { enabled: false });
  const moodCounts = useMemo(() => Object.entries((trends.data?.moods ?? []).reduce<Record<string, number>>((total, entry) => { total[entry.mood] = (total[entry.mood] ?? 0) + 1; return total; }, {})).sort((a, b) => b[1] - a[1]), [trends.data?.moods]);
  const download = async () => { const result = await exportQuery.refetch(); if (!result.data) return; const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `our-orbit-export-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); toast.success("Your private data index was downloaded."); };
  return <div className="feature-grid"><Card><div className="eyebrow"><TrendingUp size={14} /> SHARED INSIGHTS</div><h3>Notice the rhythm, gently</h3><p>These summaries describe activity in the orbit; they are not diagnoses or judgments.</p><div className="insight-stats"><span><b>{trends.data?.moods.length ?? 0}</b><small>visible check-ins</small></span><span><b>{trends.data?.wellness.length ?? 0}</b><small>visible wellness entries</small></span><span><b>{stats.data?.moments ?? 0}</b><small>memories</small></span></div><div className="mood-bars">{moodCounts.length ? moodCounts.map(([mood, count]) => <div key={mood}><span>{mood}</span><i><b style={{ width: `${Math.max(10, Math.round((count / moodCounts[0][1]) * 100))}%` }} /></i><small>{count}</small></div>) : <div className="empty-inline"><TrendingUp size={19} /><span>Add a few check-ins to see a gentle rhythm.</span></div>}</div></Card><Card><div className="eyebrow"><Archive size={14} /> PRIVATE DATA TOOLS</div><h3>Keep a copy of what matters</h3><p>Download a JSON index of the records visible to you, including memory references and captions. Media remains in private storage.</p><button className="secondary-button" onClick={download} disabled={exportQuery.isFetching}>{exportQuery.isFetching ? <Loader2 className="spin" size={15} /> : <Download size={15} />} Download private export</button><div className="storage-summary"><b>Storage summary</b><span>{stats.data?.photos ?? 0} photos · {stats.data?.videos ?? 0} videos · {Math.round((stats.data?.bytes ?? 0) / 1_048_576)} MB indexed</span><small>Remove old moments from the gallery when you want to reduce the visible library.</small></div></Card></div>;
}

export default function FeatureHubPage() {
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const initialTab: HubTab = requestedTab === "timeline" || requestedTab === "countdowns" || requestedTab === "voice" || requestedTab === "insights" || requestedTab === "chapters" || requestedTab === "keepsakes" ? requestedTab : "plans";
  const [tab, setTab] = useState<HubTab>(initialTab);
  const relationship = trpc.orbit.relationship.get.useQuery();
  const updateRotation = trpc.orbit.relationshipExtras.updateCoverRotation.useMutation();
  const rotate = trpc.orbit.relationshipExtras.rotateCover.useMutation();
  const relation = relationship.data?.relationship;
  const [rotationEnabled, setRotationEnabled] = useState(Boolean(relation?.coverRotationEnabled));
  const [rotationMode, setRotationMode] = useState<"manual" | "weekly" | "monthly" | "anniversary">(relation?.coverRotationMode ?? "manual");
  useEffect(() => { if (!relation) return; setRotationEnabled(Boolean(relation.coverRotationEnabled)); setRotationMode(relation.coverRotationMode); }, [relation?.coverRotationEnabled, relation?.coverRotationMode]);
  const saveRotation = async () => { await updateRotation.mutateAsync({ enabled: rotationEnabled, mode: rotationMode }); await relationship.refetch(); toast.success("Sphere rotation preferences saved."); };
  const rotateNow = async () => { await rotate.mutateAsync(); await relationship.refetch(); toast.success("The sphere photo changed."); };
  useEffect(() => {
    if (!relation?.coverRotationEnabled || relation.coverRotationMode === "manual" || !relation.coverRotatedAt) return;
    const elapsed = Date.now() - new Date(relation.coverRotatedAt).getTime();
    const interval = relation.coverRotationMode === "weekly" ? 7 * 86_400_000 : relation.coverRotationMode === "monthly" ? 30 * 86_400_000 : 365 * 86_400_000;
    if (elapsed >= interval) rotate.mutateAsync().then(() => relationship.refetch()).catch(() => undefined);
  }, [relation?.coverRotationEnabled, relation?.coverRotationMode, relation?.coverRotatedAt]);
  const tabs: [HubTab, string][] = [["plans", "Bucket list"], ["timeline", "Timeline"], ["countdowns", "Countdowns"], ["voice", "Voice"], ["insights", "Insights"], ["chapters", "Orbit Chapters"], ["keepsakes", "Keepsakes"]];
  return <div className="page-grid"><Card className="feature-hero"><div><div className="eyebrow"><Sparkles size={14} /> MORE OF US</div><h3>Small ways to keep choosing each other</h3><p>Plans, milestones, voice memories, insights, and private tools live here without changing the quiet feel of the orbit.</p></div><div className="sphere-controls"><label className="switch-row"><span>Rotate sphere photo</span><input type="checkbox" checked={rotationEnabled} onChange={(event) => setRotationEnabled(event.target.checked)} /><i /></label><select value={rotationMode} onChange={(event) => setRotationMode(event.target.value as typeof rotationMode)}><option value="manual">Manual</option><option value="weekly">When opened weekly</option><option value="monthly">When opened monthly</option><option value="anniversary">On anniversary month</option></select><div className="record-actions"><button className="secondary-button" onClick={saveRotation} disabled={updateRotation.isPending}>Save rotation</button><button className="primary-button" onClick={rotateNow} disabled={rotate.isPending}><RotateCw size={15} /> Rotate now</button></div></div></Card><div className="feature-tabs" role="tablist">{tabs.map(([value, label]) => <button key={value} className={tab === value ? "selected" : ""} onClick={() => setTab(value)}>{label}</button>)}</div>{tab === "plans" && <PlansPanel />}{tab === "timeline" && <TimelinePanel />}{tab === "countdowns" && <CountdownsPanel />}{tab === "voice" && <VoicePanel />}{tab === "insights" && <InsightsPanel />}{tab === "chapters" && <OrbitChaptersPage />}{tab === "keepsakes" && <OrbitKeepsakesPage />}</div>;
}
