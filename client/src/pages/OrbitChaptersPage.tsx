import { useMemo, useState } from "react";
import { Archive, CalendarClock, Check, Eye, Heart, Layers, Loader2, MessageCircle, Quote, Repeat2, Search, Send, ShieldCheck, Sparkles, Star, TimerReset, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`glass-card ${className}`}>{children}</section>;
}

function dateLabel(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function dateTimeLocal(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export default function OrbitChaptersPage() {
  const utils = trpc.useUtils();
  const moments = trpc.orbit.moments.list.useQuery();
  const albums = trpc.orbit.albums.list.useQuery();
  const recap = trpc.orbit.recap.useQuery();
  const consent = trpc.orbit.consent.useQuery();
  const promptToday = trpc.orbit.prompts.today.useQuery();
  const promptResponses = trpc.orbit.prompts.list.useQuery();
  const rituals = trpc.orbit.rituals.list.useQuery();
  const traditions = trpc.orbit.traditions.list.useQuery();
  const capsules = trpc.orbit.capsules.list.useQuery();
  const comparisons = trpc.orbit.comparisons.list.useQuery();
  const createCapsule = trpc.orbit.capsules.create.useMutation();
  const removeCapsule = trpc.orbit.capsules.remove.useMutation();
  const answerPrompt = trpc.orbit.prompts.respond.useMutation();
  const removePrompt = trpc.orbit.prompts.remove.useMutation();
  const createRitual = trpc.orbit.rituals.create.useMutation();
  const completeRitual = trpc.orbit.rituals.complete.useMutation();
  const removeRitual = trpc.orbit.rituals.remove.useMutation();
  const createTradition = trpc.orbit.traditions.create.useMutation();
  const removeTradition = trpc.orbit.traditions.remove.useMutation();
  const addReply = trpc.orbit.threads.add.useMutation();
  const removeReply = trpc.orbit.threads.remove.useMutation();
  const createComparison = trpc.orbit.comparisons.create.useMutation();

  const [capsuleTitle, setCapsuleTitle] = useState("");
  const [capsuleMessage, setCapsuleMessage] = useState("");
  const [capsuleQuote, setCapsuleQuote] = useState("");
  const [capsuleRevealAt, setCapsuleRevealAt] = useState(dateTimeLocal(new Date(Date.now() + 7 * 86_400_000)));
  const [capsuleMomentId, setCapsuleMomentId] = useState("");
  const [capsuleAlbumId, setCapsuleAlbumId] = useState("");
  const [promptResponse, setPromptResponse] = useState("");
  const [promptVisibility, setPromptVisibility] = useState<"pair" | "private">("pair");
  const [ritualName, setRitualName] = useState("");
  const [ritualCadence, setRitualCadence] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [ritualNote, setRitualNote] = useState("");
  const [ritualDueAt, setRitualDueAt] = useState(dateTimeLocal(new Date()));
  const [traditionTitle, setTraditionTitle] = useState("");
  const [traditionDetail, setTraditionDetail] = useState("");
  const [traditionSeason, setTraditionSeason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [threadMomentId, setThreadMomentId] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [olderMomentId, setOlderMomentId] = useState("");
  const [newerMomentId, setNewerMomentId] = useState("");
  const [comparisonNote, setComparisonNote] = useState("");
  const searchResults = trpc.orbit.search.useQuery({ query: searchQuery.trim() }, { enabled: searchQuery.trim().length >= 2 });
  const thread = trpc.orbit.threads.list.useQuery({ momentId: Number(threadMomentId) || 0 }, { enabled: Boolean(threadMomentId) });

  const memoryOptions = useMemo(() => moments.data?.filter(({ moment }) => moment.mediaType === "photo" || moment.mediaType === "video") ?? [], [moments.data]);
  const selectedThreadMoment = memoryOptions.find(({ moment }) => String(moment.id) === threadMomentId)?.moment;

  const refreshCapsules = async () => { await utils.orbit.capsules.list.invalidate(); };
  const refreshPrompts = async () => { await utils.orbit.prompts.list.invalidate(); };
  const refreshRituals = async () => { await utils.orbit.rituals.list.invalidate(); await utils.orbit.recap.invalidate(); };
  const refreshTraditions = async () => { await utils.orbit.traditions.list.invalidate(); };

  return <div className="page-grid">
    <Card className="chapters-hero"><div><div className="eyebrow"><WandSparkles size={14} /> ORBIT CHAPTERS</div><h3>Make the ordinary feel remembered</h3><p>Private rituals, future notes, and little chapters give your shared memories somewhere gentle to grow.</p></div><div className="chapter-recap-grid"><span><b>{recap.data?.moments ?? 0}</b><small>memories</small></span><span><b>{recap.data?.albums ?? 0}</b><small>albums</small></span><span><b>{recap.data?.milestones ?? 0}</b><small>milestones</small></span><span><b>{recap.data?.favorites ?? 0}</b><small>favorites</small></span><span><b>{capsules.data?.sealedCount ?? 0}</b><small>sealed notes</small></span></div>{recap.data?.firstMemoryAt && <small className="chapter-first-memory">Your visible story began {dateLabel(recap.data.firstMemoryAt)}.</small>}</Card>

    <div className="feature-grid">
      <Card><div className="eyebrow"><Archive size={14} /> MEMORY CAPSULES</div><h3>Leave something for later</h3><p>Seal a note, quote, and optional memory until a future date or anniversary.</p><form className="form-stack" onSubmit={async (event) => { event.preventDefault(); if (!capsuleTitle.trim() || !capsuleMessage.trim()) return; try { await createCapsule.mutateAsync({ title: capsuleTitle, message: capsuleMessage, quote: capsuleQuote || undefined, revealAt: new Date(capsuleRevealAt), momentId: capsuleMomentId ? Number(capsuleMomentId) : undefined, albumId: capsuleAlbumId ? Number(capsuleAlbumId) : undefined }); await refreshCapsules(); setCapsuleTitle(""); setCapsuleMessage(""); setCapsuleQuote(""); setCapsuleMomentId(""); setCapsuleAlbumId(""); toast.success("Your memory capsule is sealed."); } catch (error) { toast.error(error instanceof Error ? error.message : "The capsule could not be sealed."); } }}><label>Title<input value={capsuleTitle} onChange={(event) => setCapsuleTitle(event.target.value)} maxLength={160} placeholder="For us, one year from now" required /></label><label>Message<textarea value={capsuleMessage} onChange={(event) => setCapsuleMessage(event.target.value)} maxLength={2000} placeholder="What do you want us to remember?" required /></label><label>Quote <span>(optional)</span><input value={capsuleQuote} onChange={(event) => setCapsuleQuote(event.target.value)} maxLength={280} placeholder="A line worth carrying forward" /></label><label>Reveal on<input type="datetime-local" value={capsuleRevealAt} onChange={(event) => setCapsuleRevealAt(event.target.value)} required /></label><label>Attach a memory <span>(optional)</span><select value={capsuleMomentId} onChange={(event) => setCapsuleMomentId(event.target.value)}><option value="">No attached memory</option>{memoryOptions.map(({ moment }) => <option key={moment.id} value={moment.id}>{moment.caption || `Memory from ${dateLabel(moment.occurredAt)}`}</option>)}</select></label><label>Attach an album <span>(optional)</span><select value={capsuleAlbumId} onChange={(event) => setCapsuleAlbumId(event.target.value)}><option value="">No attached album</option>{albums.data?.map(({ album }) => <option key={album.id} value={album.id}>{album.name}</option>)}</select></label><button className="primary-button" disabled={createCapsule.isPending}>{createCapsule.isPending ? <Loader2 className="spin" size={15} /> : "Seal memory capsule"}<Archive size={15} /></button></form></Card>
      <Card><div className="panel-heading"><div><div className="eyebrow"><TimerReset size={14} /> CAPSULES TO COME</div><h3>{capsules.data?.sealedCount ?? 0} still sealed</h3></div><Sparkles size={18} /></div><div className="chapter-list">{capsules.data?.capsules.length ? capsules.data.capsules.map((capsule) => <div className="chapter-row" key={capsule.id}><div><b>{capsule.title}</b><small>Opened {dateLabel(capsule.revealAt)}</small><p>{capsule.message}</p>{capsule.quote && <blockquote className="moment-quote"><Quote size={13} />{capsule.quote}</blockquote>}</div><button className="quiet-delete" onClick={async () => { await removeCapsule.mutateAsync({ id: capsule.id }); await refreshCapsules(); }}>Remove</button></div>) : <div className="empty-inline"><Archive size={20} /><span>Revealed capsules will appear here when their time arrives.</span></div>}</div><small className="privacy-note"><ShieldCheck size={13} /> Sealed messages reveal only after their date.</small></Card>
    </div>

    <div className="feature-grid">
      <Card><div className="eyebrow"><Sparkles size={14} /> SHARED PROMPT</div><h3>{promptToday.data?.prompt ?? "What should we remember about this season of us?"}</h3><p>Answer in your own words. Choose whether this response is shared or private.</p><form className="form-stack" onSubmit={async (event) => { event.preventDefault(); if (!promptResponse.trim() || !promptToday.data?.prompt) return; await answerPrompt.mutateAsync({ prompt: promptToday.data.prompt, response: promptResponse, visibility: promptVisibility }); await refreshPrompts(); setPromptResponse(""); toast.success("Your prompt response was saved."); }}><textarea value={promptResponse} onChange={(event) => setPromptResponse(event.target.value)} maxLength={1200} placeholder="Write a small honest answer..." required /><label>Visibility<select value={promptVisibility} onChange={(event) => setPromptVisibility(event.target.value as typeof promptVisibility)}><option value="pair">Visible to both of us</option><option value="private">Private to me</option></select></label><button className="secondary-button" disabled={answerPrompt.isPending}>{answerPrompt.isPending ? <Loader2 className="spin" size={15} /> : "Save prompt response"}<Send size={15} /></button></form></Card>
      <Card><div className="eyebrow"><MessageCircle size={14} /> PROMPT HISTORY</div><h3>Words from our seasons</h3><div className="chapter-list">{promptResponses.data?.length ? promptResponses.data.map(({ response, authorName }) => <div className="chapter-row" key={response.id}><div><small>{dateLabel(response.createdAt)} · {authorName ?? "You"} · {response.visibility === "private" ? "Private" : "For us"}</small><b>{response.prompt}</b><p>{response.response}</p></div><button className="quiet-delete" onClick={async () => { await removePrompt.mutateAsync({ id: response.id }); await refreshPrompts(); }}>Remove</button></div>) : <div className="empty-inline"><MessageCircle size={20} /><span>Your first prompt answer will begin this little archive.</span></div>}</div></Card>
    </div>

    <div className="feature-grid">
      <Card><div className="eyebrow"><Repeat2 size={14} /> SHARED RITUALS</div><h3>Keep choosing a small tradition</h3><p>Set a recurring check-in, date night, gratitude note, or other ritual for us.</p><form className="form-stack" onSubmit={async (event) => { event.preventDefault(); if (!ritualName.trim()) return; await createRitual.mutateAsync({ name: ritualName, cadence: ritualCadence, note: ritualNote || undefined, nextDueAt: new Date(ritualDueAt) }); await refreshRituals(); setRitualName(""); setRitualNote(""); toast.success("Shared ritual added."); }}><label>Name<input value={ritualName} onChange={(event) => setRitualName(event.target.value)} maxLength={160} placeholder="Sunday voice note" required /></label><label>Cadence<select value={ritualCadence} onChange={(event) => setRitualCadence(event.target.value as typeof ritualCadence)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label>Next due<input type="datetime-local" value={ritualDueAt} onChange={(event) => setRitualDueAt(event.target.value)} required /></label><label>Note <span>(optional)</span><input value={ritualNote} onChange={(event) => setRitualNote(event.target.value)} maxLength={500} placeholder="What makes this one ours?" /></label><button className="secondary-button" disabled={createRitual.isPending}>{createRitual.isPending ? <Loader2 className="spin" size={15} /> : "Add shared ritual"}<Repeat2 size={15} /></button></form></Card>
      <Card><div className="eyebrow"><CalendarClock size={14} /> RITUALS IN MOTION</div><h3>Our gentle rhythm</h3><div className="chapter-list">{rituals.data?.length ? rituals.data.map(({ ritual, authorName }) => <div className="chapter-row" key={ritual.id}><div><b>{ritual.name}</b><small>{ritual.cadence} · next {dateLabel(ritual.nextDueAt)} · {authorName ?? "You"}</small>{ritual.note && <p>{ritual.note}</p>}</div><div className="record-actions"><button className="secondary-button" onClick={async () => { await completeRitual.mutateAsync({ id: ritual.id }); await refreshRituals(); }} disabled={completeRitual.isPending}><Check size={14} /> Done</button><button className="quiet-delete" onClick={async () => { await removeRitual.mutateAsync({ id: ritual.id }); await refreshRituals(); }}>Remove</button></div></div>) : <div className="empty-inline"><Repeat2 size={20} /><span>Add a ritual that feels natural to both of you.</span></div>}</div></Card>
    </div>

    <div className="feature-grid">
      <Card><div className="eyebrow"><Layers size={14} /> TRADITIONS LIBRARY</div><h3>Keep the things that feel like us</h3><form className="form-stack" onSubmit={async (event) => { event.preventDefault(); if (!traditionTitle.trim()) return; await createTradition.mutateAsync({ title: traditionTitle, detail: traditionDetail || undefined, season: traditionSeason || undefined }); await refreshTraditions(); setTraditionTitle(""); setTraditionDetail(""); setTraditionSeason(""); toast.success("Tradition saved."); }}><label>Tradition<input value={traditionTitle} onChange={(event) => setTraditionTitle(event.target.value)} maxLength={160} placeholder="Our first meal of spring" required /></label><label>Season <span>(optional)</span><input value={traditionSeason} onChange={(event) => setTraditionSeason(event.target.value)} maxLength={80} placeholder="Every winter" /></label><label>Details <span>(optional)</span><textarea value={traditionDetail} onChange={(event) => setTraditionDetail(event.target.value)} maxLength={800} placeholder="How we do it, and why it matters" /></label><button className="secondary-button" disabled={createTradition.isPending}>{createTradition.isPending ? <Loader2 className="spin" size={15} /> : "Save tradition"}<Heart size={15} /></button></form></Card>
      <Card><div className="eyebrow"><Heart size={14} /> OUR TRADITIONS</div><h3>The rituals we keep</h3><div className="chapter-list">{traditions.data?.length ? traditions.data.map(({ tradition, authorName }) => <div className="chapter-row" key={tradition.id}><div><b>{tradition.title}</b><small>{tradition.season || "Any season"} · {authorName ?? "You"}</small>{tradition.detail && <p>{tradition.detail}</p>}</div><button className="quiet-delete" onClick={async () => { await removeTradition.mutateAsync({ id: tradition.id }); await refreshTraditions(); }}>Remove</button></div>) : <div className="empty-inline"><Heart size={20} /><span>Save the first little tradition that belongs to you.</span></div>}</div></Card>
    </div>

    <Card><div className="panel-heading"><div><div className="eyebrow"><Search size={14} /> PRIVATE MEMORY SEARCH</div><h3>Find a thread, quote, or chapter</h3></div><Eye size={18} /></div><label className="search-field chapter-search"><Search size={15} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search captions, quotes, songs, albums, or milestones" /></label>{searchQuery.trim().length >= 2 && <div className="search-results"><div><b>Memories</b>{searchResults.data?.moments.length ? searchResults.data.moments.map(({ moment, authorName }) => <button className="search-result" key={moment.id} onClick={() => setThreadMomentId(String(moment.id))}><span>{moment.caption || "Private memory"}</span><small>{dateLabel(moment.occurredAt)} · {authorName ?? "You"}</small></button>) : <small>No matching visible memories.</small>}</div><div><b>Albums and milestones</b>{searchResults.data?.albums.map((album) => <span className="search-pill" key={`a-${album.id}`}><Layers size={12} />{album.name}</span>)}{searchResults.data?.milestones.map((milestone) => <span className="search-pill" key={`m-${milestone.id}`}><Star size={12} />{milestone.title}</span>)}{!searchResults.data?.albums.length && !searchResults.data?.milestones.length && <small>No matching chapters.</small>}</div></div>}</Card>

    <div className="feature-grid">
      <Card><div className="eyebrow"><MessageCircle size={14} /> MEMORY THREADS</div><h3>{selectedThreadMoment ? selectedThreadMoment.caption || "A memory worth returning to" : "Choose a memory"}</h3><p>Reply to a shared memory with a thought, follow-up, or voice note reference.</p><select value={threadMomentId} onChange={(event) => setThreadMomentId(event.target.value)}><option value="">Select a visible memory</option>{memoryOptions.map(({ moment }) => <option key={moment.id} value={moment.id}>{moment.caption || `Memory from ${dateLabel(moment.occurredAt)}`}</option>)}</select>{threadMomentId && <><form className="reply-row" onSubmit={async (event) => { event.preventDefault(); if (!replyBody.trim()) return; await addReply.mutateAsync({ momentId: Number(threadMomentId), body: replyBody }); await utils.orbit.threads.list.invalidate({ momentId: Number(threadMomentId) }); setReplyBody(""); toast.success("Reply added to the memory thread."); }}><input value={replyBody} onChange={(event) => setReplyBody(event.target.value)} maxLength={1000} placeholder="Add a thought to this memory" required /><button type="submit" disabled={addReply.isPending} aria-label="Add reply"><Send size={15} /></button></form><div className="chapter-list">{thread.data?.length ? thread.data.map(({ reply, authorName }) => <div className="chapter-row" key={reply.id}><div><small>{dateLabel(reply.createdAt)} · {authorName ?? "You"}</small><p>{reply.body}</p></div><button className="quiet-delete" onClick={async () => { await removeReply.mutateAsync({ id: reply.id }); await utils.orbit.threads.list.invalidate({ momentId: Number(threadMomentId) }); }}>Remove</button></div>) : <div className="empty-inline"><MessageCircle size={18} /><span>This memory has no replies yet.</span></div>}</div></>}</Card>
      <Card><div className="eyebrow"><Repeat2 size={14} /> THEN &amp; NOW</div><h3>Pair two memories</h3><p>Compare an older memory with a newer one and write what changed—or what stayed.</p><div className="form-stack"><label>Older memory<select value={olderMomentId} onChange={(event) => setOlderMomentId(event.target.value)}><option value="">Choose an older memory</option>{memoryOptions.map(({ moment }) => <option key={moment.id} value={moment.id}>{moment.caption || dateLabel(moment.occurredAt)} · {dateLabel(moment.occurredAt)}</option>)}</select></label><label>Newer memory<select value={newerMomentId} onChange={(event) => setNewerMomentId(event.target.value)}><option value="">Choose a newer memory</option>{memoryOptions.map(({ moment }) => <option key={moment.id} value={moment.id}>{moment.caption || dateLabel(moment.occurredAt)} · {dateLabel(moment.occurredAt)}</option>)}</select></label><input value={comparisonNote} onChange={(event) => setComparisonNote(event.target.value)} maxLength={500} placeholder="What do you notice now?" /><button className="secondary-button" onClick={async () => { if (!olderMomentId || !newerMomentId) return toast.error("Choose two memories first."); await createComparison.mutateAsync({ olderMomentId: Number(olderMomentId), newerMomentId: Number(newerMomentId), note: comparisonNote || undefined }); await utils.orbit.comparisons.list.invalidate(); setComparisonNote(""); toast.success("Then and now comparison saved."); }} disabled={createComparison.isPending}>{createComparison.isPending ? <Loader2 className="spin" size={15} /> : "Save comparison"}<Repeat2 size={15} /></button></div><div className="chapter-list">{comparisons.data?.length ? comparisons.data.map((comparison) => { const older = memoryOptions.find(({ moment }) => moment.id === comparison.olderMomentId)?.moment; const newer = memoryOptions.find(({ moment }) => moment.id === comparison.newerMomentId)?.moment; return <div className="comparison-row" key={comparison.id}><div><small>{dateLabel(older?.occurredAt)} → {dateLabel(newer?.occurredAt)}</small><b>{older?.caption || "Older memory"} → {newer?.caption || "Newer memory"}</b>{comparison.note && <p>{comparison.note}</p>}</div></div>; }) : <div className="empty-inline"><Repeat2 size={18} /><span>Pair two memories when a place or tradition changes.</span></div>}</div></Card>
    </div>

    <Card><div className="panel-heading"><div><div className="eyebrow"><ShieldCheck size={14} /> CONSENT CENTER</div><h3>Know what is shared</h3></div><ShieldCheck size={19} /></div><p>Your private orbit keeps shared and personal records separate. This view shows counts, not private content.</p><div className="consent-grid"><span><b>{consent.data?.members ?? 0}</b><small>linked members</small></span><span><b>{consent.data?.moments.shared ?? 0}</b><small>shared memories</small></span><span><b>{consent.data?.moments.private ?? 0}</b><small>private memories</small></span><span><b>{consent.data?.voice.shared ?? 0}</b><small>shared voice notes</small></span><span><b>{consent.data?.voice.private ?? 0}</b><small>private voice notes</small></span><span><b>{consent.data?.prompts.private ?? 0}</b><small>private prompt answers</small></span></div><small className="privacy-note"><ShieldCheck size={13} /> Use the existing privacy controls to change visibility or remove any record.</small></Card>
  </div>;
}

export { dateLabel };
