import { useAuth } from "@/_core/hooks/useAuth";
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CalendarDays, Camera, Check, ChevronRight, CircleOff, Compass, Copy, Heart, ImagePlus, Loader2, LockKeyhole, LogOut, MapPin, Menu, MessageCircleHeart, MoonStar, Plus, Radio, Search, Settings, ShieldCheck, Sparkles, Star, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import FeatureHubPage from "./FeatureHubPage";

const NAVIGATION = [
  { path: "/", label: "Orbit", icon: Compass },
  { path: "/moments", label: "Moments", icon: ImagePlus },
  { path: "/feelings", label: "Feelings", icon: MessageCircleHeart },
  { path: "/location", label: "Location", icon: MapPin },
  { path: "/wellness", label: "Calendar", icon: CalendarDays },
  { path: "/more", label: "More of us", icon: Sparkles },
];

const MOODS = ["radiant", "calm", "tender", "heavy", "restless", "hopeful"] as const;
const PAGE_TITLES: Record<string, [string, string]> = {
  "/": ["Your shared orbit", "A quiet place made just for us."],
  "/moments": ["Moments", "Your private constellation of memories."],
  "/feelings": ["Feelings", "Small check-ins. Gentle responses. No audience."],
  "/location": ["Location", "Live sharing is optional and always yours to stop."],
  "/wellness": ["Private calendar", "Cycle, mood, and wellness entries remain under your control."],
  "/more": ["More of us", "Plans, milestones, voice memories, and gentle insights."],
  "/settings": ["Orbit settings", "Invite your partner and tailor what reaches you."],
};

function useElapsed(startDate?: Date | string) {
  const start = startDate ? new Date(startDate).getTime() : Date.now();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const total = Math.max(0, now - start);
  return {
    days: Math.floor(total / 86_400_000),
    hours: Math.floor((total % 86_400_000) / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    seconds: Math.floor((total % 60_000) / 1000),
  };
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`glass-card ${className}`}>{children}</section>;
}

function LoadingScreen() {
  return <div className="loading-screen"><span className="loader-orbit" /><p>Aligning your orbit…</p></div>;
}

function DataError({ title = "This private view could not be loaded." }: { title?: string }) {
  return <div className="data-error"><CircleOff size={24} /><h3>{title}</h3><p>Please check your connection and refresh. No shared data was exposed outside this private space.</p><button className="secondary-button" onClick={() => window.location.reload()}>Refresh securely</button></div>;
}

function PrivateGate({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) {
    return <main className="welcome-shell"><div className="ambient-orb orb-one" /><div className="ambient-orb orb-two" />
      <div className="welcome-card"><div className="brand-mark"><span /> <b>OUR ORBIT</b></div><div className="eyebrow"><LockKeyhole size={14} /> PRIVATE FOR TWO</div>
        <h1>A universe made <em>just for you.</em></h1><p>Shared memories, thoughtful check-ins, and consent-led connection—protected behind your authenticated private space.</p>
        <button className="primary-button" onClick={() => startLogin()}>Enter your orbit <ChevronRight size={17} /></button>
        <p className="privacy-foot"><ShieldCheck size={15} /> Only linked members can view shared content.</p>
      </div>
    </main>;
  }
  return <>{children}</>;
}

function SetupOrbit() {
  const setup = trpc.orbit.relationship.setup.useMutation();
  const utils = trpc.useUtils();
  const [name, setName] = useState("Our Orbit");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await setup.mutateAsync({ displayName: name, startDate: new Date(`${startDate}T00:00:00`) });
    await utils.orbit.relationship.get.invalidate();
    toast.success("Your private orbit is ready.");
  };
  return <main className="setup-shell"><div className="ambient-orb orb-one" /><div className="ambient-orb orb-two" />
    <GlassCard className="setup-card"><div className="eyebrow"><Sparkles size={14} /> FIRST, CREATE YOUR SPACE</div><h1>Begin your <em>shared orbit.</em></h1><p>Set the relationship name and the date you began. You can invite one partner after this step.</p>
      <form className="form-stack" onSubmit={submit}><label>What should this space be called?<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label><label>When did your story begin?<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></label>
        <button className="primary-button" disabled={setup.isPending}>{setup.isPending ? <Loader2 className="spin" size={17} /> : "Create private orbit"}<ChevronRight size={17} /></button></form>
    </GlassCard>
  </main>;
}

function InviteScreen({ token }: { token: string }) {
  const [, navigate] = useLocation();
  const preview = trpc.orbit.relationship.previewInvite.useQuery({ token }, { retry: false });
  const accept = trpc.orbit.relationship.acceptInvite.useMutation();
  const utils = trpc.useUtils();
  const acceptInvite = async () => {
    await accept.mutateAsync({ token });
    await utils.orbit.relationship.get.invalidate();
    toast.success("You are now linked to the private orbit.");
    navigate("/");
  };
  if (preview.isLoading) return <LoadingScreen />;
  if (preview.error || !preview.data) return <main className="setup-shell"><GlassCard className="setup-card"><CircleOff size={30} /><h1>Invitation unavailable</h1><p>This invitation may have expired, been used, or been revoked by the orbit owner.</p><button className="secondary-button" onClick={() => navigate("/")}>Return home</button></GlassCard></main>;
  return <main className="setup-shell"><div className="ambient-orb orb-one" /><GlassCard className="setup-card"><div className="eyebrow"><LockKeyhole size={14} /> PRIVATE INVITATION</div><h1>Join <em>{preview.data.displayName}</em></h1><p>You are joining a private two-person space. Once accepted, shared content is visible only to the linked pair.</p><div className="date-pill">Together since {formatDate(preview.data.startDate)}</div><button className="primary-button" onClick={acceptInvite} disabled={accept.isPending}>{accept.isPending ? <Loader2 className="spin" size={17} /> : "Accept private invitation"}<ChevronRight size={17} /></button></GlassCard></main>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const relationship = trpc.orbit.relationship.get.useQuery();
  const notifications = trpc.orbit.notifications.list.useQuery(undefined, { enabled: Boolean(relationship.data?.relationship) });
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const current = PAGE_TITLES[location] ?? PAGE_TITLES["/"];
  const unread = notifications.data?.filter((item) => !item.readAt).length ?? 0;
  const markRead = trpc.orbit.notifications.markRead.useMutation();
  if (relationship.isLoading) return <LoadingScreen />;
  if (relationship.error) return <main className="setup-shell"><GlassCard className="setup-card"><DataError title="Your private orbit could not be opened." /></GlassCard></main>;
  if (!relationship.data?.relationship) return <SetupOrbit />;
  const go = (path: string) => { navigate(path); setMenuOpen(false); };
  return <div className="app-shell"><aside className={`side-rail ${menuOpen ? "open" : ""}`}><button className="wordmark" onClick={() => go("/")}><span className="brand-ring" /> <strong>OUR ORBIT</strong></button>
    <div className="rail-label">PRIVATE SPACE</div><nav>{NAVIGATION.map((item) => { const Icon = item.icon; return <button key={item.path} className={`nav-button ${location === item.path ? "active" : ""}`} onClick={() => go(item.path)}><Icon size={18} /> <span>{item.label}</span></button>; })}</nav>
    <div className="rail-bottom"><button className={`nav-button ${location === "/settings" ? "active" : ""}`} onClick={() => go("/settings")}><Settings size={18} /> <span>Settings</span></button><button className="profile-button" onClick={() => logout()}><span>{user?.name?.slice(0, 1).toUpperCase() ?? "Y"}</span><div><b>{user?.name ?? "You"}</b><small>Private member</small></div><LogOut size={15} /></button></div>
  </aside><div className={`veil ${menuOpen ? "show" : ""}`} onClick={() => setMenuOpen(false)} />
    <div className="app-content"><header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={21} /></button><div><div className="eyebrow">{relationship.data.relationship.displayName}</div><h2>{current[0]}</h2><p>{current[1]}</p></div><div className="top-actions"><button className="icon-button notification-button" onClick={() => setNoticeOpen((open) => !open)} aria-label="Open notifications"><Bell size={19} />{unread > 0 && <i>{unread}</i>}</button><div className="avatar-orb">{relationship.data.partner?.name?.slice(0, 1).toUpperCase() ?? "∞"}</div></div>
      {noticeOpen && <div className="notification-panel"><div className="panel-heading"><b>Private notifications</b><button onClick={() => setNoticeOpen(false)}><X size={16} /></button></div>{notifications.data?.length ? notifications.data.map((notice) => <button className={`notice-item ${notice.readAt ? "" : "unread"}`} key={notice.id} onClick={async () => { await markRead.mutateAsync({ id: notice.id }); if (notice.targetPath) navigate(notice.targetPath); setNoticeOpen(false); }}><span><Bell size={14} /></span><div><b>{notice.title}</b><p>{notice.body}</p></div></button>) : <p className="empty-note">No private notifications yet.</p>}</div>}</header>
      <AnimatePresence mode="wait"><motion.main key={location} initial={{ opacity: 0, y: 10, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -7, filter: "blur(4px)" }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>{children}</motion.main></AnimatePresence>
    </div></div>;
}

function HomePage() {
  const [, navigate] = useLocation();
  const relationship = trpc.orbit.relationship.get.useQuery();
  const duration = trpc.orbit.relationship.duration.useQuery();
  const moments = trpc.orbit.moments.list.useQuery();
  const elapsed = useElapsed(duration.data?.startDate);
  const selectedCoverId = relationship.data?.relationship?.coverMomentId;
  const cover = moments.data?.find(({ moment }) => moment.id === selectedCoverId && moment.mediaType === "photo")?.moment.mediaUrl
    ?? moments.data?.find(({ moment }) => moment.mediaType === "photo")?.moment.mediaUrl;
  const partnerName = relationship.data?.partner?.name ?? "your partner";
  if (relationship.error || duration.error || moments.error) return <DataError title="Your orbit dashboard could not be loaded." />;
  return <div className="page-grid home-grid"><GlassCard className="hero-card"><div className="hero-copy"><div className="eyebrow"><Heart size={14} /> PRIVATE &amp; LINKED</div><h1>{relationship.data?.relationship?.displayName}</h1><p>A living record of your time together, held in a space that only we can enter.</p><div className="stat-row"><span><b>{elapsed.days.toLocaleString()}</b> days</span><span><b>{elapsed.hours}</b> hours</span><span><b>{elapsed.minutes}</b> mins</span><span><b>{elapsed.seconds}</b> secs</span></div><button className="text-link" onClick={() => navigate("/moments")}>Add a memory <ChevronRight size={16} /></button></div><div className="sphere-stage"><div className="orbit-line line-one" /><div className="orbit-line line-two" /><div className="photo-sphere" style={cover ? { backgroundImage: `linear-gradient(135deg, rgba(15, 7, 29, .35), rgba(224, 109, 218, .15)), url(${cover})` } : undefined}><div className="sphere-gloss" /><div className="sphere-text"><b>{elapsed.days}</b><span>days together</span></div></div><div className="sphere-satellite"><Heart size={14} fill="currentColor" /></div></div></GlassCard>
    <GlassCard className="connected-card"><div className="panel-heading"><div><span className="eyebrow">YOUR CONNECTION</span><h3>{relationship.data?.partner ? "Two in orbit" : "Awaiting your person"}</h3></div><span className={`status-dot ${relationship.data?.partner ? "live" : ""}`} /></div><p>{relationship.data?.partner ? `${partnerName} is linked to this private space. Shared features unlock only for your pair.` : "Create a one-time partner invitation in Settings. This orbit accepts only one partner."}</p><button className="secondary-button" onClick={() => navigate(relationship.data?.partner ? "/feelings" : "/settings")}>{relationship.data?.partner ? "Share a feeling" : "Invite partner"}</button></GlassCard>
    <GlassCard className="quick-card"><div className="panel-heading"><div><span className="eyebrow">A GENTLE PROMPT</span><h3>How are you arriving today?</h3></div><MoonStar size={20} /></div><p>A short check-in can turn a busy day into a moment of closeness.</p><button className="text-link" onClick={() => navigate("/feelings")}>Open feelings <ChevronRight size={16} /></button></GlassCard>
    <GlassCard className="recent-card"><div className="panel-heading"><div><span className="eyebrow">RECENT CONSTELLATION</span><h3>Shared moments</h3></div><button className="icon-button" onClick={() => navigate("/moments")}><ChevronRight size={17} /></button></div>{moments.data?.length ? <div className="mini-moment-grid">{moments.data.slice(0, 3).map(({ moment }) => <div key={moment.id} className="mini-moment">{moment.mediaType === "photo" ? <img src={moment.mediaUrl} alt={moment.caption || "Shared memory"} /> : <video src={moment.mediaUrl} muted />}</div>)}</div> : <div className="empty-inline"><ImagePlus size={19} /><span>Your first image becomes the living texture of the relationship sphere.</span></div>}</GlassCard>
  </div>;
}

function MomentsPage() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const moments = trpc.orbit.moments.list.useQuery();
  const create = trpc.orbit.moments.create.useMutation();
  const update = trpc.orbit.moments.update.useMutation();
  const remove = trpc.orbit.moments.remove.useMutation();
  const prepareUpload = trpc.orbit.moments.prepareUpload.useMutation();
  const setCover = trpc.orbit.moments.setCover.useMutation();
  const toggleFavorite = trpc.orbit.moments.toggleFavorite.useMutation();
  const react = trpc.orbit.moments.react.useMutation();
  const stats = trpc.orbit.moments.stats.useQuery();
  const relationship = trpc.orbit.relationship.get.useQuery();
  const [file, setFile] = useState<File | null>(null); const [caption, setCaption] = useState(""); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [filter, setFilter] = useState<"all" | "photo" | "video">("all"); const [query, setQuery] = useState(""); const [favoritesOnly, setFavoritesOnly] = useState(false); const [visibility, setVisibility] = useState<"pair" | "private">("pair"); const [editingMoment, setEditingMoment] = useState<{ id: number; caption: string; occurredAt: string } | null>(null); const inputRef = useRef<HTMLInputElement>(null); const cameraInputRef = useRef<HTMLInputElement>(null);
  const visibleMoments = moments.data?.filter(({ moment }) => (filter === "all" || moment.mediaType === filter) && (!favoritesOnly || moment.favorite) && (!query.trim() || `${moment.caption ?? ""} ${formatDate(moment.occurredAt)}`.toLowerCase().includes(query.trim().toLowerCase()))) ?? [];
  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return toast.error("Choose a photo or video first.");
    if (file.size > 15 * 1024 * 1024) return toast.error("Choose media smaller than 15 MB.");
    const mimeType = file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/heic" | "image/heif" | "video/mp4" | "video/webm";
    try {
      const prepared = await prepareUpload.mutateAsync({ filename: file.name, mimeType });
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      Object.entries(prepared.uploadParams).forEach(([key, value]) => uploadForm.append(key, value));
      const uploadResponse = await fetch(prepared.uploadUrl, { method: "POST", body: uploadForm });
      if (!uploadResponse.ok) throw new Error(`Cloudinary upload failed (${uploadResponse.status}).`);
      await create.mutateAsync({ filename: file.name, mimeType, fileKey: prepared.key, mediaUrl: prepared.url, caption: caption || undefined, visibility, fileSizeBytes: file.size, occurredAt: new Date(`${date}T12:00:00`) });
      await utils.orbit.moments.list.invalidate();
      setFile(null);
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      toast.success("Moment safely added to your private orbit.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The private moment could not be uploaded.");
    }
  };
  if (moments.error) return <DataError title="Your private moments could not be loaded." />;
  return <div className="page-grid"><GlassCard className="upload-card"><div><div className="eyebrow"><LockKeyhole size={14} /> PRIVATE MEDIA</div><h3>Add a shared moment</h3><p>Photos and videos are stored as private files; the database retains only their secure references and details. Either of us can choose a shared photo for the sphere.</p></div><form className="upload-form" onSubmit={upload}><label className={`drop-zone ${file ? "chosen" : ""}`}><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><ImagePlus size={21} /><span>{file ? file.name : "Choose photo or video"}</span><small>Choose from your phone gallery · up to 15 MB</small></label><label className="secondary-button camera-source"><input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><Camera size={17} /> Take a photo</label><label>Caption<input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} placeholder="A tiny note to remember this by" /></label><label>Privacy<select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="pair">Visible to both of us</option><option value="private">Private to me</option></select></label><label>Date of this moment<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><button className="primary-button" disabled={create.isPending || prepareUpload.isPending}>{create.isPending || prepareUpload.isPending ? <Loader2 className="spin" size={17} /> : "Save private moment"}<Heart size={16} /></button></form></GlassCard>
    <div className="section-head"><div><div className="eyebrow">YOUR CONSTELLATION</div><h3>Shared memories</h3></div><span>{visibleMoments.length} shown · {stats.data?.moments ?? 0} total</span></div><div className="moment-tools"><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search captions and dates" /></label><div className="filter-row" role="group" aria-label="Filter moments"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "photo" ? "selected" : ""} onClick={() => setFilter("photo")}>Photos</button><button className={filter === "video" ? "selected" : ""} onClick={() => setFilter("video")}>Videos</button><button className={favoritesOnly ? "selected" : ""} onClick={() => setFavoritesOnly((value) => !value)}><Star size={13} /> Favorites</button></div></div><div className="moment-grid">{moments.isLoading ? <LoadingScreen /> : visibleMoments.length ? visibleMoments.map(({ moment, authorName, reactions }) => <GlassCard key={moment.id} className="moment-card"><div className="media-frame">{moment.mediaType === "photo" ? <img src={moment.mediaUrl} alt={moment.caption || "Shared moment"} /> : <video src={moment.mediaUrl} controls preload="metadata" />}</div><div className="moment-meta"><small>{formatDate(moment.occurredAt)} · {authorName ?? "You"} · {moment.visibility === "private" ? "Private" : "For us"}</small><div className="memory-actions"><button className={moment.favorite ? "quiet-delete active-action" : "quiet-delete"} onClick={async () => { await toggleFavorite.mutateAsync({ id: moment.id }); await utils.orbit.moments.list.invalidate(); }}><Star size={13} fill={moment.favorite ? "currentColor" : "none"} /> {moment.favorite ? "Favorite" : "Save"}</button><button className={reactions?.some((reaction) => reaction.userId === user?.id && reaction.kind === "heart") ? "quiet-delete active-action" : "quiet-delete"} onClick={async () => { await react.mutateAsync({ id: moment.id, kind: "heart" }); await utils.orbit.moments.list.invalidate(); }}><Heart size={13} fill={reactions?.some((reaction) => reaction.kind === "heart") ? "currentColor" : "none"} /> {reactions?.filter((reaction) => reaction.kind === "heart").length ?? 0}</button><button className="quiet-delete" onClick={async () => { await react.mutateAsync({ id: moment.id, kind: "remember" }); await utils.orbit.moments.list.invalidate(); }}>Remember</button></div>{editingMoment?.id === moment.id ? <form className="inline-edit" onSubmit={async (event) => { event.preventDefault(); await update.mutateAsync({ id: moment.id, caption: editingMoment.caption || undefined, occurredAt: new Date(`${editingMoment.occurredAt}T12:00:00`) }); await utils.orbit.moments.list.invalidate(); setEditingMoment(null); toast.success("Your private moment was updated."); }}><label>Caption<input value={editingMoment.caption} maxLength={500} onChange={(event) => setEditingMoment({ ...editingMoment, caption: event.target.value })} /></label><label>Date<input type="date" value={editingMoment.occurredAt} onChange={(event) => setEditingMoment({ ...editingMoment, occurredAt: event.target.value })} /></label><div className="record-actions"><button className="secondary-button" type="button" onClick={() => setEditingMoment(null)}>Cancel</button><button className="primary-button" disabled={update.isPending}>{update.isPending ? <Loader2 className="spin" size={14} /> : "Save changes"}</button></div></form> : <><p>{moment.caption || "A private moment"}</p>{moment.createdById === user?.id && <div className="record-actions"><button className="quiet-delete" onClick={() => setEditingMoment({ id: moment.id, caption: moment.caption || "", occurredAt: new Date(moment.occurredAt).toISOString().slice(0, 10) })}>Edit</button><button className="quiet-delete" onClick={async () => { await update.mutateAsync({ id: moment.id, caption: moment.caption || undefined, occurredAt: new Date(moment.occurredAt), visibility: moment.visibility === "pair" ? "private" : "pair" }); await utils.orbit.moments.list.invalidate(); toast.success(moment.visibility === "pair" ? "This memory is private now." : "This memory is shared with us again."); }}>{moment.visibility === "pair" ? "Make private" : "Share with us"}</button><button className="quiet-delete" onClick={async () => { await remove.mutateAsync({ id: moment.id }); await utils.orbit.moments.list.invalidate(); await utils.orbit.relationship.get.invalidate(); }}>Remove</button></div>}</>}
            {moment.mediaType === "photo" && <div className="record-actions"><button className={relationship.data?.relationship?.coverMomentId === moment.id ? "secondary-button cover-selected" : "secondary-button"} onClick={async () => { await setCover.mutateAsync({ id: moment.id }); await utils.orbit.relationship.get.invalidate(); toast.success("The sphere picture was updated for us."); }} disabled={setCover.isPending}>{relationship.data?.relationship?.coverMomentId === moment.id ? "Current sphere picture" : "Use in sphere"}</button></div>}</div></GlassCard>) : <div className="empty-state"><ImagePlus size={30} /><h3>{moments.data?.length ? "No matching private moments." : "Your constellation begins here."}</h3><p>{moments.data?.length ? "Try a different media filter." : "Add the first photo or video that holds meaning for us."}</p></div>}</div>
  </div>;
}

function FeelingsPage() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const entries = trpc.orbit.feelings.list.useQuery();
  const create = trpc.orbit.feelings.create.useMutation();
  const update = trpc.orbit.feelings.update.useMutation();
  const respond = trpc.orbit.feelings.respond.useMutation();
  const [mood, setMood] = useState<(typeof MOODS)[number]>("calm");
  const [note, setNote] = useState("");
  const [sharing, setSharing] = useState<"partner" | "private">("partner");
  const [editingFeelingId, setEditingFeelingId] = useState<number | null>(null);
  const [responses, setResponses] = useState<Record<number, string>>({});
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (editingFeelingId) await update.mutateAsync({ id: editingFeelingId, mood, note, visibility: sharing }); else await create.mutateAsync({ mood, note, visibility: sharing }); setNote(""); setEditingFeelingId(null); await utils.orbit.feelings.list.invalidate(); toast.success(editingFeelingId ? "Your check-in was updated." : sharing === "partner" ? "Your check-in was shared privately." : "Your check-in remains private to you."); };
  if (entries.error) return <DataError title="Your feelings space could not be loaded." />;
  return <div className="page-grid feelings-grid"><GlassCard className="checkin-card"><div className="eyebrow"><Heart size={14} /> GENTLE CHECK-IN</div><h3>{editingFeelingId ? "Update your check-in" : "What is present for you?"}</h3><form className="form-stack" onSubmit={submit}><div className="mood-row">{MOODS.map((option) => <button type="button" key={option} className={`mood-chip ${mood === option ? "selected" : ""}`} onClick={() => setMood(option)}>{option}</button>)}</div><label>Say it in your own words<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={800} required placeholder="A few words are enough…" /></label><div className="visibility-toggle"><button type="button" className={sharing === "partner" ? "selected" : ""} onClick={() => setSharing("partner")}><Heart size={14} /> Share with partner</button><button type="button" className={sharing === "private" ? "selected" : ""} onClick={() => setSharing("private")}><LockKeyhole size={14} /> Keep private</button></div><div className="record-actions">{editingFeelingId && <button className="secondary-button" type="button" onClick={() => { setEditingFeelingId(null); setMood("calm"); setNote(""); setSharing("partner"); }}>Cancel edit</button>}<button className="primary-button" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? <Loader2 className="spin" size={17} /> : editingFeelingId ? "Save changes" : "Save check-in"}<ChevronRight size={17} /></button></div></form></GlassCard><div className="feelings-list"><div className="section-head"><div><div className="eyebrow">SHARED RHYTHM</div><h3>Check-ins</h3></div></div>{entries.data?.length ? entries.data.map(({ feeling, authorName, responses: replies }) => <GlassCard key={feeling.id} className="feeling-entry"><div className="panel-heading"><div><span className={`mood-dot ${feeling.mood}`} /><b>{feeling.mood}</b><small>{authorName ?? "You"} · {formatDate(feeling.createdAt)}</small></div><span className="visibility-note">{feeling.visibility === "private" ? <LockKeyhole size={13} /> : <Heart size={13} />}</span></div><p>{feeling.note}</p>{feeling.authorId === user?.id && <button className="quiet-delete" onClick={() => { setEditingFeelingId(feeling.id); setMood(feeling.mood as (typeof MOODS)[number]); setNote(feeling.note); setSharing(feeling.visibility); }}>Edit my check-in</button>}{replies.map(({ response, authorName: replyName }) => <div className="support-response" key={response.id}><Heart size={13} /><span><b>{replyName ?? "Partner"}</b>{response.message}</span></div>)}<form className="reply-row" onSubmit={async (event) => { event.preventDefault(); const message = responses[feeling.id]?.trim(); if (!message) return; await respond.mutateAsync({ feelingId: feeling.id, message }); setResponses((current) => ({ ...current, [feeling.id]: "" })); await utils.orbit.feelings.list.invalidate(); }}><input aria-label="Supportive response" value={responses[feeling.id] ?? ""} onChange={(e) => setResponses((current) => ({ ...current, [feeling.id]: e.target.value }))} maxLength={500} placeholder="Offer a gentle response…" /><button aria-label="Send response"><ChevronRight size={16} /></button></form></GlassCard>) : <div className="empty-state"><MessageCircleHeart size={30} /><h3>Make room for small truths.</h3><p>Check in whenever you need to be known.</p></div>}</div></div>;
}

function LocationPage() {
  const utils = trpc.useUtils(); const records = trpc.orbit.location.get.useQuery(); const share = trpc.orbit.location.share.useMutation(); const stop = trpc.orbit.location.stop.useMutation(); const watchId = useRef<number | null>(null); const visible = records.data?.filter((record) => record.location.sharingEnabled && record.location.latitude !== null && record.location.longitude !== null) ?? [];
  const stopSharing = async () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; await stop.mutateAsync(); await utils.orbit.location.get.invalidate(); toast.success("Location sharing has stopped and the last coordinates were cleared."); };
  const beginSharing = () => { if (!navigator.geolocation) return toast.error("This browser does not support location sharing."); navigator.geolocation.getCurrentPosition(() => { watchId.current = navigator.geolocation.watchPosition(async (position) => { await share.mutateAsync({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy }); await utils.orbit.location.invalidate(); }, () => toast.error("Location permission is needed to share your live position."), { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }); toast.success("Live location sharing is on while this app is open. You can stop it at any time."); }, () => toast.error("Location permission is needed to start sharing."), { enableHighAccuracy: true, timeout: 20_000 }); };
  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); }, []);
  const firstVisibleLocation = visible[0]?.location;
  const center = firstVisibleLocation && firstVisibleLocation.latitude !== null && firstVisibleLocation.longitude !== null ? { lat: Number(firstVisibleLocation.latitude), lng: Number(firstVisibleLocation.longitude) } : { lat: 0, lng: 0 };
  if (records.error) return <DataError title="Your private location status could not be loaded." />;
  return <div className="page-grid location-grid"><GlassCard className="consent-card"><div className="eyebrow"><ShieldCheck size={14} /> CONSENT-LED SHARING</div><h3>Share only when it feels right.</h3><p>Location sharing is off by default. When you stop it, the current coordinates are removed from the private orbit immediately.</p><div className="location-actions"><button className="primary-button" onClick={beginSharing} disabled={share.isPending}><Radio size={16} /> Start sharing</button><button className="danger-button" onClick={stopSharing} disabled={stop.isPending}><CircleOff size={16} /> Stop &amp; clear</button></div><div className="consent-note"><LockKeyhole size={15} /><span>Your linked partner can see a location only while you explicitly keep sharing enabled.</span></div></GlassCard><GlassCard className="map-card"><div className="panel-heading"><div><span className="eyebrow">PRIVATE MAP</span><h3>{visible.length ? "Current shared locations" : "No active location sharing"}</h3></div><MapPin size={19} /></div>{visible.length ? <MapView key={`${center.lat}-${center.lng}-${visible.length}`} className="private-map" initialCenter={center} initialZoom={11} onMapReady={(map) => { if (!window.google) return; visible.forEach((record) => { const latitude = Number(record.location.latitude); const longitude = Number(record.location.longitude); new window.google.maps.Marker({ map, position: { lat: latitude, lng: longitude }, title: `${record.name ?? "Partner"} is sharing location` }); }); }} /> : <div className="map-empty"><MapPin size={30} /><p>When either person turns sharing on, their latest location appears here for the linked pair.</p></div>}</GlassCard></div>;
}

function WellnessPage() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const entries = trpc.orbit.wellness.list.useQuery();
  const create = trpc.orbit.wellness.create.useMutation();
  const update = trpc.orbit.wellness.update.useMutation();
  const remove = trpc.orbit.wellness.remove.useMutation();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [cycleLength, setCycleLength] = useState("28");
  const [type, setType] = useState<"cycle" | "mood" | "wellness">("cycle");
  const [value, setValue] = useState("Period");
  const [note, setNote] = useState("");
  const [shareWithPartner, setShareWithPartner] = useState(false);
  const [remind, setRemind] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const days = useMemo(() => Array.from({ length: 35 }, (_, index) => { const current = new Date(); current.setDate(current.getDate() - 17 + index); return current; }), []);
  const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
  const inPeriodRange = (entry: { entryDate: Date; periodEndDate: Date | null; entryType: string }, key: string) => {
    if (entry.entryType !== "cycle") return dateKey(entry.entryDate) === key;
    const start = dateKey(entry.entryDate);
    const end = entry.periodEndDate ? dateKey(entry.periodEndDate) : start;
    return key >= start && key <= end;
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (type === "cycle" && periodEndDate && periodEndDate < date) return toast.error("Period end date must be on or after the start date.");
    const payload = {
      entryDate: date,
      periodEndDate: type === "cycle" && periodEndDate ? periodEndDate : undefined,
      cycleLength: type === "cycle" && cycleLength ? Number(cycleLength) : undefined,
      entryType: type,
      value: value || (type === "cycle" ? "Period" : "Wellness note"),
      note: note || undefined,
      shareWithPartner,
      reminderAt: remind ? new Date(`${date}T09:00:00`) : null,
    };
    if (editingEntryId) await update.mutateAsync({ id: editingEntryId, ...payload });
    else await create.mutateAsync(payload);
    setValue(type === "cycle" ? "Period" : "");
    setNote("");
    setPeriodEndDate("");
    setEditingEntryId(null);
    await utils.orbit.wellness.list.invalidate();
    toast.success(editingEntryId ? "Your private entry was updated." : shareWithPartner ? "Period dates were shared with your partner." : "Private calendar entry saved.");
  };
  if (entries.error) return <DataError title="Your private calendar could not be loaded." />;
  return <div className="page-grid wellness-grid"><GlassCard className="privacy-card"><div className="eyebrow"><LockKeyhole size={14} /> YOUR BODY, YOUR CONTROLS</div><h3>Private by default.</h3><p>Period dates, cycle information, mood, and sexual-wellness notes are sensitive. Each entry stays private unless you explicitly choose to share it with your linked partner.</p><div className="privacy-list"><span><Check size={14} /> Period dates are explicit start and end dates</span><span><Check size={14} /> Sharing is chosen for each entry</span><span><Check size={14} /> Only you can edit or remove your records</span></div></GlassCard><GlassCard className="calendar-card"><div className="panel-heading"><div><span className="eyebrow">THIS MONTH</span><h3>Your rhythm</h3></div><CalendarDays size={20} /></div><div className="calendar-key"><span><i className="period-key" /> Private period date</span><span><i className="shared-key" /> Shared period date</span></div><div className="calendar-week">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="calendar-grid">{days.map((day) => { const key = dateKey(day); const dayEntries = entries.data?.filter(({ entry }) => inPeriodRange(entry, key)) ?? []; const sharedPeriod = dayEntries.some(({ entry }) => entry.entryType === "cycle" && entry.shareWithPartner); const privatePeriod = dayEntries.some(({ entry }) => entry.entryType === "cycle") && !sharedPeriod; return <div key={day.toISOString()} className={`calendar-day ${key === date ? "selected" : ""} ${sharedPeriod ? "shared-period" : privatePeriod ? "period-day" : ""}`}><button onClick={() => setDate(key)}>{day.getDate()}</button>{dayEntries.length > 0 && <i>{dayEntries.length}</i>}</div>; })}</div></GlassCard><GlassCard className="wellness-form-card"><div className="eyebrow"><Plus size={14} /> PERIOD &amp; WELLNESS ENTRY</div><h3>{editingEntryId ? "Update your entry" : type === "cycle" ? "Record period dates" : "Mark today your way"}</h3><form className="form-stack" onSubmit={submit}><label>Track<select value={type} onChange={(e) => { const selected = e.target.value as typeof type; setType(selected); setValue(selected === "cycle" ? "Period" : ""); setPeriodEndDate(""); }}><option value="cycle">Period / cycle</option><option value="mood">Mood</option><option value="wellness">Wellness / sexual wellness</option></select></label><label>{type === "cycle" ? "Period start date" : "Date"}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>{type === "cycle" && <><label>Period end date <span>(optional if it is still ongoing)</span><input type="date" min={date} value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} /></label><label>Typical cycle length <span>(days, optional)</span><input type="number" min="20" max="45" value={cycleLength} onChange={(e) => setCycleLength(e.target.value)} /></label></>}<label>{type === "cycle" ? "Period note" : "What would you like to note?"}<input value={value} onChange={(e) => setValue(e.target.value)} required maxLength={80} placeholder={type === "cycle" ? "e.g. Period, spotting, symptoms" : "e.g. energetic, intimacy, tired"} /></label><label>Private note <span>(optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={800} /></label><label className="check-row"><input type="checkbox" checked={shareWithPartner} onChange={(e) => setShareWithPartner(e.target.checked)} /><span>{type === "cycle" ? "Share these period dates with my partner" : "Share this one entry with my partner"}</span></label><label className="check-row"><input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} /><span>Show a private reminder to me</span></label><div className="record-actions">{editingEntryId && <button className="secondary-button" type="button" onClick={() => { setEditingEntryId(null); setType("cycle"); setValue("Period"); setNote(""); setPeriodEndDate(""); setCycleLength("28"); setShareWithPartner(false); setRemind(false); }}>Cancel edit</button>}<button className="primary-button" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? <Loader2 className="spin" size={17} /> : editingEntryId ? "Save changes" : type === "cycle" ? "Save period dates" : "Save entry"}<Check size={16} /></button></div></form></GlassCard><GlassCard className="entries-card"><div className="panel-heading"><div><span className="eyebrow">RECENT ENTRIES</span><h3>Protected record</h3></div></div>{entries.data?.length ? <div className="wellness-entries">{entries.data.map(({ entry, ownerName }) => <div className="wellness-entry" key={entry.id}><div><span className={`entry-badge ${entry.entryType}`}>{entry.entryType === "cycle" ? "period" : entry.entryType}</span><b>{entry.value}</b><small>{entry.entryType === "cycle" && entry.periodEndDate ? `${formatDate(entry.entryDate)} – ${formatDate(entry.periodEndDate)}` : formatDate(entry.entryDate)} · {ownerName ?? "You"}</small>{entry.entryType === "cycle" && entry.cycleLength && <small>Typical cycle: {entry.cycleLength} days</small>}{entry.note && <p>{entry.note}</p>}</div><div className="entry-actions"><span title={entry.shareWithPartner ? "Shared with partner" : "Private to owner"}>{entry.shareWithPartner ? <Heart size={14} /> : <LockKeyhole size={14} />}</span>{entry.ownerId === user?.id && <><button onClick={() => { setEditingEntryId(entry.id); setDate(dateKey(entry.entryDate)); setPeriodEndDate(entry.periodEndDate ? dateKey(entry.periodEndDate) : ""); setCycleLength(entry.cycleLength ? String(entry.cycleLength) : ""); setType(entry.entryType); setValue(entry.value); setNote(entry.note || ""); setShareWithPartner(entry.shareWithPartner); setRemind(Boolean(entry.reminderAt)); }}>Edit</button><button onClick={async () => { await remove.mutateAsync({ id: entry.id }); await utils.orbit.wellness.list.invalidate(); }}>Remove</button></>}</div></div>)}</div> : <div className="empty-inline"><CalendarDays size={20} /><span>No entries yet. Your tracking begins only when you decide to add one.</span></div>}</GlassCard></div>;
}

function SettingsPage() {
  const relationship = trpc.orbit.relationship.get.useQuery();
  const prefs = trpc.orbit.notifications.preferences.useQuery();
  const invite = trpc.orbit.relationship.createInvite.useMutation();
  const updateRelationship = trpc.orbit.relationship.update.useMutation();
  const updatePrefs = trpc.orbit.notifications.updatePreferences.useMutation();
  const utils = trpc.useUtils();
  const [inviteLink, setInviteLink] = useState("");
  const [orbitName, setOrbitName] = useState("");
  const [orbitStartDate, setOrbitStartDate] = useState("");
  const [form, setForm] = useState({ memoriesEnabled: true, feelingsEnabled: true, wellnessEnabled: false, remindersEnabled: false });
  useEffect(() => { if (prefs.data) setForm({ memoriesEnabled: prefs.data.memoriesEnabled, feelingsEnabled: prefs.data.feelingsEnabled, wellnessEnabled: prefs.data.wellnessEnabled, remindersEnabled: prefs.data.remindersEnabled }); }, [prefs.data]);
  useEffect(() => { if (relationship.data?.relationship) { setOrbitName(relationship.data.relationship.displayName); setOrbitStartDate(new Date(relationship.data.relationship.startDate).toISOString().slice(0, 10)); } }, [relationship.data]);
  if (relationship.error || prefs.error) return <DataError title="Your orbit settings could not be loaded." />;
  const createInvite = async () => { const result = await invite.mutateAsync(); const link = `${window.location.origin}/invite?token=${result.token}`; setInviteLink(link); await navigator.clipboard?.writeText(link); toast.success("One-time invitation created and copied. It expires in seven days."); };
  const saveOrbitSettings = async (event: React.FormEvent) => { event.preventDefault(); await updateRelationship.mutateAsync({ displayName: orbitName, startDate: new Date(`${orbitStartDate}T00:00:00`) }); await utils.orbit.relationship.get.invalidate(); toast.success("Orbit settings updated."); };
  const isOwner = relationship.data?.member?.role === "owner";
  return <div className="page-grid settings-grid"><GlassCard><div className="eyebrow"><LockKeyhole size={14} /> LINKED PAIR ACCESS</div><h3>Invite your one partner</h3><p>{relationship.data?.partner ? `${relationship.data.partner.name ?? "Your partner"} is already linked. This orbit cannot add a third person.` : "Create a one-time invitation. Only the first authenticated person to accept it can join this orbit."}</p>{isOwner && !relationship.data?.partner && <><button className="primary-button" onClick={createInvite} disabled={invite.isPending}>{invite.isPending ? <Loader2 className="spin" size={17} /> : "Create private invitation"}<Copy size={16} /></button>{inviteLink && <div className="invite-link"><input readOnly value={inviteLink} /><button onClick={() => navigator.clipboard?.writeText(inviteLink)} aria-label="Copy invitation"><Copy size={16} /></button></div>}</>}</GlassCard>{isOwner && <GlassCard><div className="eyebrow"><Settings size={14} /> ORBIT OWNER CONTROLS</div><h3>Update shared details</h3><p>As the orbit owner, you can change the shared name and relationship start date. Personal records remain editable only by the person who created them.</p><form className="form-stack" onSubmit={saveOrbitSettings}><label>Orbit name<input value={orbitName} onChange={(event) => setOrbitName(event.target.value)} minLength={2} maxLength={80} required /></label><label>Relationship start date<input type="date" value={orbitStartDate} onChange={(event) => setOrbitStartDate(event.target.value)} required /></label><button className="secondary-button" disabled={updateRelationship.isPending}>{updateRelationship.isPending ? <Loader2 className="spin" size={15} /> : "Save shared details"}</button></form></GlassCard>}<GlassCard><div className="eyebrow"><Bell size={14} /> NOTIFICATION CONSENT</div><h3>Choose what reaches you</h3><p>Notifications appear inside the private orbit. Wellness and reminders begin off so sensitive details stay quiet unless you opt in.</p><div className="preference-list">{([ ["memoriesEnabled", "New memories"], ["feelingsEnabled", "Shared feelings"], ["wellnessEnabled", "Shared wellness entries"], ["remindersEnabled", "My private reminders"] ] as const).map(([key, label]) => <label className="switch-row" key={key}><span>{label}</span><input type="checkbox" checked={form[key]} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.checked }))} /><i /></label>)}</div><button className="secondary-button" onClick={async () => { await updatePrefs.mutateAsync(form); toast.success("Notification choices updated."); }} disabled={updatePrefs.isPending}>Save choices</button></GlassCard></div>;
}

function RoutedApplication() {
  const [location] = useLocation(); const token = new URLSearchParams(window.location.search).get("token");
  if (location === "/invite" && token) return <PrivateGate><InviteScreen token={token} /></PrivateGate>;
  return <PrivateGate><AppShell>{location === "/moments" ? <MomentsPage /> : location === "/feelings" ? <FeelingsPage /> : location === "/location" ? <LocationPage /> : location === "/wellness" ? <WellnessPage /> : location === "/more" ? <FeatureHubPage /> : location === "/settings" ? <SettingsPage /> : <HomePage />}</AppShell></PrivateGate>;
}

export default RoutedApplication;
