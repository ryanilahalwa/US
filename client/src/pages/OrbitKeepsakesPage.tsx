import { useMemo, useState } from "react";
import { Archive, CalendarHeart, Check, Clock3, Eye, Heart, Layers, Loader2, MapPin, Navigation, Send, ShieldCheck, Sparkles, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MapView } from "@/components/Map";
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

export default function OrbitKeepsakesPage() {
  const utils = trpc.useUtils();
  const moments = trpc.orbit.moments.list.useQuery();
  const drops = trpc.orbit.surpriseDrops.list.useQuery();
  const places = trpc.orbit.places.list.useQuery();
  const anniversary = trpc.orbit.anniversary.useQuery();
  const createDrop = trpc.orbit.surpriseDrops.create.useMutation();
  const openDrop = trpc.orbit.surpriseDrops.open.useMutation();
  const removeDrop = trpc.orbit.surpriseDrops.remove.useMutation();
  const createPlace = trpc.orbit.places.create.useMutation();
  const removePlace = trpc.orbit.places.remove.useMutation();

  const [dropTitle, setDropTitle] = useState("");
  const [dropMessage, setDropMessage] = useState("");
  const [dropQuote, setDropQuote] = useState("");
  const [dropRevealAt, setDropRevealAt] = useState(dateTimeLocal(new Date(Date.now() + 7 * 86_400_000)));
  const [dropMomentId, setDropMomentId] = useState("");
  const [placeTitle, setPlaceTitle] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [placeLatitude, setPlaceLatitude] = useState("");
  const [placeLongitude, setPlaceLongitude] = useState("");
  const [placeVisitedAt, setPlaceVisitedAt] = useState("");
  const [placeNote, setPlaceNote] = useState("");
  const [placeVisibility, setPlaceVisibility] = useState<"pair" | "private">("pair");
  const visibleMoments = useMemo(() => moments.data?.filter(({ moment }) => moment.visibility === "pair") ?? [], [moments.data]);
  const mapPlaces = useMemo(() => places.data?.filter(({ place }) => place.latitude !== null && place.longitude !== null) ?? [], [places.data]);
  const firstPlace = mapPlaces[0]?.place;
  const mapCenter = firstPlace && firstPlace.latitude !== null && firstPlace.longitude !== null ? { lat: Number(firstPlace.latitude), lng: Number(firstPlace.longitude) } : { lat: 0, lng: 0 };

  const refreshDrops = async () => { await utils.orbit.surpriseDrops.list.invalidate(); };
  const refreshPlaces = async () => { await utils.orbit.places.list.invalidate(); };

  return <div className="page-grid">
    <Card className="keepsakes-hero"><div><div className="eyebrow"><Sparkles size={14} /> KEEPSAKES</div><h3>Private surprises, places, and anniversaries</h3><p>Make a little room for the moments that are not ready yet, the places that made you, and the dates you want to keep choosing.</p></div><div className="keepsake-pill-row"><span><b>{drops.data?.sealedCount ?? 0}</b><small>surprises sealed</small></span><span><b>{places.data?.length ?? 0}</b><small>places kept</small></span><span><b>{anniversary.data?.daysUntil ?? 0}</b><small>days to anniversary</small></span></div></Card>

    <Card className="anniversary-mode"><div className="anniversary-copy"><div className="eyebrow"><CalendarHeart size={14} /> PRIVATE ANNIVERSARY MODE</div><h3>{anniversary.data ? `${anniversary.data.displayName} turns ${anniversary.data.yearsTogether} ${anniversary.data.yearsTogether === 1 ? "year" : "years"}` : "Your next chapter is waiting"}</h3><p>{anniversary.data ? `Your next anniversary is ${dateLabel(anniversary.data.nextAnniversary)}. This private view gathers the things you have already marked as meaningful.` : "Create your private orbit to unlock the anniversary view."}</p><div className="anniversary-count"><strong>{anniversary.data?.daysUntil ?? "—"}</strong><span>days until our next anniversary</span></div></div><div className="anniversary-highlights"><div><b><Star size={14} /> Favorites</b>{anniversary.data?.favorites.length ? anniversary.data.favorites.map((moment) => <span key={moment.id}>{moment.caption || `Memory from ${dateLabel(moment.occurredAt)}`}</span>) : <small>Favorite shared memories will appear here.</small>}</div><div><b><Layers size={14} /> Milestones</b>{anniversary.data?.milestones.length ? anniversary.data.milestones.slice(0, 3).map((milestone) => <span key={milestone.id}>{milestone.title} · {dateLabel(milestone.milestoneDate)}</span>) : <small>Add album milestones to build the recap.</small>}</div><div><b><Heart size={14} /> Traditions</b>{anniversary.data?.traditions.length ? anniversary.data.traditions.slice(0, 3).map((tradition) => <span key={tradition.id}>{tradition.title}</span>) : <small>Save a tradition to make this view yours.</small>}</div></div></Card>

    <div className="feature-grid">
      <Card><div className="eyebrow"><Send size={14} /> SURPRISE DROPS</div><h3>Send a secret for later</h3><p>Write something for your partner. It stays hidden until the date you choose, then appears only in their orbit.</p><form className="form-stack" onSubmit={async (event) => { event.preventDefault(); if (!dropTitle.trim() || !dropMessage.trim()) return; try { await createDrop.mutateAsync({ title: dropTitle, message: dropMessage, quote: dropQuote || undefined, revealAt: new Date(dropRevealAt), momentId: dropMomentId ? Number(dropMomentId) : undefined }); await refreshDrops(); setDropTitle(""); setDropMessage(""); setDropQuote(""); setDropMomentId(""); toast.success("Surprise drop sealed for later."); } catch (error) { toast.error(error instanceof Error ? error.message : "The surprise could not be sealed."); } }}><label>Title<input value={dropTitle} onChange={(event) => setDropTitle(event.target.value)} maxLength={160} placeholder="A note for the next quiet day" required /></label><label>Message<textarea value={dropMessage} onChange={(event) => setDropMessage(event.target.value)} maxLength={2000} placeholder="Something you want your person to find" required /></label><label>Quote <span>(optional)</span><input value={dropQuote} onChange={(event) => setDropQuote(event.target.value)} maxLength={280} placeholder="A line that belongs with it" /></label><label>Reveal on<input type="datetime-local" value={dropRevealAt} onChange={(event) => setDropRevealAt(event.target.value)} required /></label><label>Attach a shared memory <span>(optional)</span><select value={dropMomentId} onChange={(event) => setDropMomentId(event.target.value)}><option value="">No attached memory</option>{visibleMoments.map(({ moment }) => <option key={moment.id} value={moment.id}>{moment.caption || `Memory from ${dateLabel(moment.occurredAt)}`}</option>)}</select></label><button className="primary-button" disabled={createDrop.isPending}>{createDrop.isPending ? <Loader2 className="spin" size={15} /> : "Seal surprise drop"}<Send size={15} /></button></form></Card>
      <Card><div className="panel-heading"><div><div className="eyebrow"><Clock3 size={14} /> DROPBOX</div><h3>{drops.data?.sealedCount ?? 0} still hidden</h3></div><Archive size={18} /></div><div className="chapter-list"><div className="drop-section"><b>Received</b>{drops.data?.received.length ? drops.data.received.map(({ drop, recipientName }) => <div className="chapter-row surprise-row" key={drop.id}><div><small>{dateLabel(drop.revealAt)} · from {recipientName || "your person"}</small><b>{drop.title}</b><p>{drop.message}</p>{drop.quote && <blockquote className="moment-quote">“{drop.quote}”</blockquote>}</div>{!drop.openedAt && <button className="secondary-button" onClick={async () => { await openDrop.mutateAsync({ id: drop.id }); await refreshDrops(); }}><Check size={14} /> Opened</button>}</div>) : <div className="empty-inline"><Heart size={18} /><span>Nothing has arrived yet. That is okay; the next surprise can be yours.</span></div>}</div><div className="drop-section"><b>Sent</b>{drops.data?.sent.length ? drops.data.sent.map(({ drop }) => <div className="chapter-row surprise-row" key={drop.id}><div><small>{new Date(drop.revealAt).getTime() > Date.now() ? `Sealed until ${dateLabel(drop.revealAt)}` : `Revealed ${dateLabel(drop.revealAt)}`}</small><b>{drop.title}</b><p>{new Date(drop.revealAt).getTime() > Date.now() ? "Your message is waiting quietly." : "Your person can now open this drop."}</p></div><button className="quiet-delete" onClick={async () => { await removeDrop.mutateAsync({ id: drop.id }); await refreshDrops(); }}><Trash2 size={13} /> Remove</button></div>) : <div className="empty-inline"><Archive size={18} /><span>Your sent surprises will appear here.</span></div>}</div></div><small className="privacy-note"><ShieldCheck size={13} /> Surprise content is never shown before its reveal date.</small></Card>
    </div>

    <div className="feature-grid places-layout">
      <Card><div className="eyebrow"><MapPin size={14} /> OUR PLACES</div><h3>Keep the places that made us</h3><p>Save a meaningful place with an optional map pin. Location data is off unless you choose to add coordinates.</p><form className="form-stack" onSubmit={async (event) => { event.preventDefault(); if (!placeTitle.trim()) return; try { await createPlace.mutateAsync({ title: placeTitle, address: placeAddress || undefined, latitude: placeLatitude ? Number(placeLatitude) : undefined, longitude: placeLongitude ? Number(placeLongitude) : undefined, visitedAt: placeVisitedAt ? new Date(placeVisitedAt) : undefined, note: placeNote || undefined, visibility: placeVisibility }); await refreshPlaces(); setPlaceTitle(""); setPlaceAddress(""); setPlaceLatitude(""); setPlaceLongitude(""); setPlaceVisitedAt(""); setPlaceNote(""); toast.success("Meaningful place saved."); } catch (error) { toast.error(error instanceof Error ? error.message : "The place could not be saved."); } }}><label>Place title<input value={placeTitle} onChange={(event) => setPlaceTitle(event.target.value)} maxLength={160} placeholder="The café where we stayed too long" required /></label><label>Address <span>(optional)</span><input value={placeAddress} onChange={(event) => setPlaceAddress(event.target.value)} maxLength={500} placeholder="A name or address" /></label><div className="coordinate-fields"><label>Latitude <span>(optional)</span><input inputMode="decimal" value={placeLatitude} onChange={(event) => setPlaceLatitude(event.target.value)} placeholder="51.5072" /></label><label>Longitude <span>(optional)</span><input inputMode="decimal" value={placeLongitude} onChange={(event) => setPlaceLongitude(event.target.value)} placeholder="-0.1276" /></label></div><label>Visited on <span>(optional)</span><input type="date" value={placeVisitedAt} onChange={(event) => setPlaceVisitedAt(event.target.value)} /></label><label>Note <span>(optional)</span><textarea value={placeNote} onChange={(event) => setPlaceNote(event.target.value)} maxLength={800} placeholder="Why this place still feels like ours" /></label><label>Visibility<select value={placeVisibility} onChange={(event) => setPlaceVisibility(event.target.value as typeof placeVisibility)}><option value="pair">Visible to both of us</option><option value="private">Private to me</option></select></label><button className="secondary-button" disabled={createPlace.isPending}>{createPlace.isPending ? <Loader2 className="spin" size={15} /> : "Save meaningful place"}<MapPin size={15} /></button></form></Card>
      <Card className="places-card"><div className="panel-heading"><div><div className="eyebrow"><Navigation size={14} /> PLACE MAP</div><h3>{mapPlaces.length ? `${mapPlaces.length} pinned places` : "Our map is waiting"}</h3></div><Eye size={18} /></div>{mapPlaces.length ? <MapView key={`${mapCenter.lat}-${mapCenter.lng}-${mapPlaces.length}`} className="places-map" initialCenter={mapCenter} initialZoom={mapPlaces.length === 1 ? 13 : 5} onMapReady={(map) => { if (!window.google) return; mapPlaces.forEach(({ place }) => { if (place.latitude === null || place.longitude === null) return; new window.google.maps.Marker({ map, position: { lat: Number(place.latitude), lng: Number(place.longitude) }, title: place.title }); }); }} /> : <div className="map-empty"><MapPin size={30} /><p>Add coordinates when you want a place to appear here. Names and notes can stay private without a map pin.</p></div>}<div className="chapter-list">{places.data?.map(({ place, authorName }) => <div className="chapter-row place-row" key={place.id}><div><b>{place.title}</b><small>{place.address || "No address saved"} · {place.visitedAt ? dateLabel(place.visitedAt) : "Date not set"} · {place.visibility === "private" ? "Private" : "For us"} · {authorName || "You"}</small>{place.note && <p>{place.note}</p>}</div><button className="quiet-delete" onClick={async () => { await removePlace.mutateAsync({ id: place.id }); await refreshPlaces(); }}><Trash2 size={13} /> Remove</button></div>)}</div><small className="privacy-note"><ShieldCheck size={13} /> Places marked private are visible only to their creator.</small></Card>
    </div>
  </div>;
}
