import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Search,
  MapPin,
  ArrowUpRight,
  ArrowRight,
  Car,
  CalendarDays,
  Bookmark,
  Ticket,
  Plus,
  Navigation,
  ShieldCheck,
  Clock,
  SlidersHorizontal,
  X,
  Check,
  ChevronDown,
  Copy,
  Users,
  ParkingCircle,
  House,
  Zap,
  Menu,
  LocateFixed,
  Sparkles,
  LoaderCircle,
  Upload,
  ChevronRight,
  Map as MapIcon,
  List,
  LogOut,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Capacitor } from "@capacitor/core";
import "leaflet/dist/leaflet.css";
import "./style.css";
type Space = {
  id: string;
  name: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  price: number;
  capacity: number;
  available: number;
  vehicle: string;
  covered: number;
  ev: number;
  instructions: string;
  kind: string;
};
type Booking = {
  id: string;
  name: string;
  area: string;
  address: string;
  instructions: string;
  lat: number;
  lng: number;
  start: string;
  end: string;
  plate: string;
  status: string;
  total: number;
  event_id: string | null;
};
type Event = {
  id: string;
  name: string;
  venue: string;
  start: string;
  end: string;
  quantity: number;
  claimed: number;
};
let session = localStorage.getItem("parkly-session");
if (!session) {
  session = crypto.randomUUID();
  localStorage.setItem("parkly-session", session);
}
async function api(path: string, body?: unknown) {
  const apiRoot = Capacitor.isNativePlatform()
    ? "http://127.0.0.1:3001/api"
    : "/api";
  const r = await fetch(apiRoot + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Session": session! },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok)
    throw Error(data.error || "Something went wrong. Please try again.");
  return data;
}
const localDate = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const initialStart = new Date(
  Math.ceil((Date.now() + 3600000) / 3600000) * 3600000,
);
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
const dateLabel = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
const vehicleTypes = ["Bike", "Hatchback", "Sedan", "SUV"];
const areaCenters: Record<string, [number, number]> = {
  "Jubilee Hills": [17.433, 78.407],
  "HITEC City": [17.4411, 78.3788],
  "Banjara Hills": [17.4124, 78.4382],
  Gachibowli: [17.438, 78.3489],
  Shamshabad: [17.2602, 78.388],
};
function Recenter({
  center,
  visible,
}: {
  center: [number, number];
  visible: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      map.invalidateSize();
      map.setView(center, 14);
    });
    return () => cancelAnimationFrame(id);
  }, [center[0], center[1], visible]);
  return null;
}
export default function App() {
  const [page, setPage] = useState("discover"),
    [menu, setMenu] = useState(false),
    [query, setQuery] = useState("Jubilee Hills"),
    [search, setSearch] = useState("Jubilee Hills"),
    [start, setStart] = useState(localDate(initialStart)),
    [end, setEnd] = useState(localDate(new Date(+initialStart + 3 * 3600000))),
    [vehicle, setVehicle] = useState("Sedan"),
    [mode, setMode] = useState("Hourly / daily");
  const [spaces, setSpaces] = useState<Space[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [owner, setOwner] = useState<{ spaces: Space[]; arrivals: Booking[] }>({
      spaces: [],
      arrivals: [],
    });
  const [saved, setSaved] = useState<string[]>(
      JSON.parse(localStorage.getItem("parkly-saved") || "[]"),
    ),
    [selected, setSelected] = useState<Space | null>(null),
    [modal, setModal] = useState(""),
    [pass, setPass] = useState<Booking | null>(null),
    [plate, setPlate] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [loading, setLoading] = useState(true),
    [filter, setFilter] = useState("All spaces"),
    [sort, setSort] = useState("Recommended"),
    [mobileMap, setMobileMap] = useState(false),
    [invite, setInvite] = useState<Event | null>(null),
    [checkId, setCheckId] = useState("");
  const [newEvent, setNewEvent] = useState({
    name: "",
    venue: "Jubilee Hills",
    quantity: 6,
    spaceIds: [] as string[],
  });
  const [listing, setListing] = useState({
    name: "",
    area: "Jubilee Hills",
    address: "",
    lat: 17.433,
    lng: 78.407,
    price: 40,
    capacity: 1,
    vehicle: "Sedan",
    covered: false,
    ev: false,
    instructions: "",
  });
  const [aiStatus, setAiStatus] = useState(""),
    [aiBusy, setAiBusy] = useState(false),
    [preview, setPreview] = useState("");
  function navigate(p: string) {
    setPage(p);
    setMenu(false);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function refresh() {
    setLoading(true);
    try {
      const [s, b, e, o] = await Promise.all([
        api(
          `/spaces?start=${encodeURIComponent(new Date(start).toISOString())}&end=${encodeURIComponent(new Date(end).toISOString())}`,
        ),
        api("/bookings"),
        api("/events"),
        api("/owner"),
      ]);
      setSpaces(s);
      setBookings(b);
      setEvents(e);
      setOwner(o);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    const id = new URLSearchParams(location.search).get("invite");
    if (id)
      api("/events/" + encodeURIComponent(id))
        .then((e) => {
          setInvite(e);
          setModal("invite");
        })
        .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => refresh(), 250);
    return () => clearTimeout(t);
  }, [start, end]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && modal) {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[role=dialog] button:not(:disabled), [role=dialog] a[href], [role=dialog] input, [role=dialog] select, [role=dialog] textarea",
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [modal]);
  function close() {
    setModal("");
    setSelected(null);
    setPass(null);
    setError("");
  }
  function save(id: string) {
    const a = saved.includes(id)
      ? saved.filter((s) => s !== id)
      : [...saved, id];
    setSaved(a);
    localStorage.setItem("parkly-saved", JSON.stringify(a));
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reserve(eventId?: string) {
    await action(async () => {
      const b = await api("/bookings", {
        spaceId: selected?.id,
        eventId,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        vehicle,
        plate,
      });
      const all = await api("/bookings");
      setBookings(all);
      setPass(all.find((x: Booking) => x.id === b.id));
      setModal("pass");
      await refresh();
      setToast("Your parking space is reserved");
    });
  }
  async function copyInvite(e: Event) {
    const url = location.origin + "/?invite=" + e.id;
    try {
      await navigator.clipboard.writeText(url);
      setToast("Invitation link copied");
    } catch {
      setInvite(e);
      setModal("share");
    }
  }
  async function analyze(file: File) {
    if (!file.type.startsWith("image/")) {
      setAiStatus("Choose an image file.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    const url = URL.createObjectURL(file);
    setPreview(url);
    setAiBusy(true);
    setAiStatus(
      "Downloading the open-source vision model. The first run may take a minute.",
    );
    try {
      const { pipeline } = await import("@huggingface/transformers");
      const model = await pipeline(
        "image-classification",
        "Xenova/mobilevit-xx-small",
        { device: "wasm", dtype: "fp32" },
      );
      const output = await model(url, { top_k: 3 });
      setAiStatus(
        (output[0]?.score < 0.2
          ? "No confident scene identification. Low-confidence candidates: "
          : "On-device observations: ") +
          output
            .map((x: any) => `${x.label} (${Math.round(x.score * 100)}%)`)
            .join(", ") +
          ". General scene labels only. Confirm parking suitability, dimensions and access yourself.",
      );
      await model.dispose();
    } catch {
      setAiStatus(
        "The vision model could not load. Check connectivity and try the photo again. You can still complete the listing manually.",
      );
    } finally {
      setAiBusy(false);
    }
  }
  const needle = search.toLowerCase();
  let filtered = spaces.filter(
    (s) =>
      (page !== "saved" || saved.includes(s.id)) &&
      (page === "saved" ||
        !needle ||
        `${s.name} ${s.area} ${s.address}`.toLowerCase().includes(needle)) &&
      vehicleTypes.indexOf(vehicle) <= vehicleTypes.indexOf(s.vehicle) &&
      (filter !== "Covered" || s.covered) &&
      (filter !== "EV charging" || s.ev) &&
      (filter !== "Under ₹40/hr" || s.price < 40),
  );
  filtered = [...filtered].sort((a, b) =>
    sort === "Price: low to high"
      ? a.price - b.price
      : sort === "Most availability"
        ? b.available - a.available
        : 0,
  );
  const center: [number, number] = areaCenters[search] || [17.433, 78.407];
  const duration = Math.max(
    1,
    Math.ceil((+new Date(end) - +new Date(start)) / 3600000),
  );
  const field = (label: string, el: React.ReactNode) => (
    <label className="field">
      <span>{label}</span>
      {el}
    </label>
  );
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="nav-shell">
        <div className="nav glass">
          <button className="brand" onClick={() => navigate("discover")}>
            <span className="brand-symbol">
              <ParkingCircle size={25} />
            </span>
            Park<span className="serif">ly</span>
            <span className="beta">HYD</span>
          </button>
          <nav className={menu ? "open" : ""} aria-label="Main navigation">
            {[
              ["discover", "Find parking"],
              ["events", "Event parking"],
              ["host", "List your space"],
            ].map(([p, n]) => (
              <button
                key={p}
                className={page === p ? "nav-active" : ""}
                onClick={() => navigate(p)}
              >
                {n}
              </button>
            ))}
          </nav>
          <div className="nav-right">
            <button
              className={
                "icon-btn saved-nav " + (page === "saved" ? "active" : "")
              }
              onClick={() => navigate("saved")}
              aria-label="Saved spaces"
            >
              <Bookmark size={18} />
            </button>
            <button
              className="btn dark small"
              onClick={() => navigate("bookings")}
            >
              <Ticket size={16} />
              <span>My bookings</span>
            </button>
            <button
              className="icon-btn menu"
              aria-label="Toggle navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>
      <main id="main">
        <div className="demo-bar">
          <span className="demo-dot" /> Hyderabad preview{" "}
          <span className="demo-note">
            · Demo spaces. No real payments or parking rights.
          </span>
        </div>
        {(page === "discover" || page === "saved") && (
          <>
            <section className="page-intro">
              <div>
                <div className="eyebrow">
                  <span /> A SPACE FOR EVERY PLAN
                </div>
                <h1>
                  {page === "saved" ? (
                    <>
                      Your saved <em>spaces.</em>
                    </>
                  ) : (
                    <>
                      A little less circling.
                      <br />A lot more <em>arriving.</em>
                    </>
                  )}
                </h1>
                <p>
                  {page === "saved"
                    ? "The places you want to come back to."
                    : "From your morning coffee to their big day. Find your space in Hyderabad."}
                </p>
              </div>
              <div className="intro-note">
                <span className="orbit">
                  <Navigation size={23} />
                </span>
                <span>
                  Good plans start
                  <br />
                  with a place to park.
                </span>
              </div>
            </section>
            {page === "discover" && (
              <section className="search-island glass">
                <div className="search-top">
                  <div className="segmented">
                    {["Hourly / daily", "Monthly", "Airport"].map((m) => (
                      <button
                        key={m}
                        className={mode === m ? "selected" : ""}
                        onClick={() => {
                          setMode(m);
                          if (m === "Monthly") {
                            setEnd(
                              localDate(
                                new Date(+new Date(start) + 30 * 86400000),
                              ),
                            );
                          }
                          if (m === "Hourly / daily") {
                            setEnd(
                              localDate(
                                new Date(+new Date(start) + 3 * 3600000),
                              ),
                            );
                          }
                          if (m === "Airport") {
                            setQuery("Shamshabad");
                            setEnd(
                              localDate(
                                new Date(+new Date(start) + 3 * 3600000),
                              ),
                            );
                          }
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <span className="quiet">
                    <ShieldCheck size={14} /> Reserve before you arrive
                  </span>
                </div>
                <form
                  className="search-fields"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSearch(query);
                    refresh();
                  }}
                >
                  <label className="destination">
                    <MapPin size={21} />
                    <span>
                      <small>WHERE ARE YOU HEADED?</small>
                      <input
                        aria-label="Destination"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        list="areas"
                        placeholder="Place, neighbourhood or venue"
                      />
                    </span>
                  </label>
                  <datalist id="areas">
                    {Object.keys(areaCenters).map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </datalist>
                  <label>
                    <CalendarDays size={19} />
                    <span>
                      <small>ARRIVING</small>
                      <input
                        aria-label="Arriving"
                        type="datetime-local"
                        required
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                      />
                    </span>
                  </label>
                  <label>
                    <Clock size={19} />
                    <span>
                      <small>LEAVING</small>
                      <input
                        aria-label="Leaving"
                        type="datetime-local"
                        required
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                      />
                    </span>
                  </label>
                  <button className="btn dark search-btn" type="submit">
                    <Search size={19} />
                    <span>Find a space</span>
                    <ArrowRight size={18} />
                  </button>
                </form>
                {mode === "Monthly" && (
                  <p className="mode-note">
                    30-day parking, calculated at each space’s hourly rate.
                    Monthly discounts are not available in this preview.
                  </p>
                )}
              </section>
            )}
            <div className="results-top">
              <div className="filter-row">
                {["All spaces", "Covered", "EV charging", "Under ₹40/hr"].map(
                  (f) => (
                    <button
                      className={"chip " + (filter === f ? "on" : "")}
                      key={f}
                      onClick={() => setFilter(f)}
                    >
                      {f === "Covered" ? (
                        <House size={15} />
                      ) : f === "EV charging" ? (
                        <Zap size={15} />
                      ) : null}
                      {f}
                    </button>
                  ),
                )}
                <label className="chip vehicle-chip">
                  <Car size={16} />
                  <select
                    aria-label="Vehicle size"
                    value={vehicle}
                    onChange={(e) => setVehicle(e.target.value)}
                  >
                    {vehicleTypes.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="chip map-switch"
                onClick={() => setMobileMap(!mobileMap)}
              >
                {mobileMap ? <List size={15} /> : <MapIcon size={15} />}{" "}
                {mobileMap ? "List" : "Map"}
              </button>
            </div>
            {error && !modal && (
              <div role="alert" className="error">
                {error}
                <button onClick={refresh}>Try again</button>
              </div>
            )}
            <section className="discovery">
              <div className={"results " + (mobileMap ? "mobile-hidden" : "")}>
                <div className="results-heading">
                  <div>
                    <h2>
                      {page === "saved"
                        ? "Saved spaces"
                        : search || "Across Hyderabad"}
                    </h2>
                    <p>
                      {loading
                        ? "Finding your spaces…"
                        : `${filtered.length} places to park`}{" "}
                      <span>· {vehicle}</span>
                    </p>
                  </div>
                  <label className="sort">
                    <SlidersHorizontal size={15} />
                    <select
                      aria-label="Sort parking"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option>Recommended</option>
                      <option>Price: low to high</option>
                      <option>Most availability</option>
                    </select>
                  </label>
                </div>
                {loading ? (
                  <div className="loading">
                    <LoaderCircle className="spin" /> Finding a place for your
                    plans…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="empty glass">
                    <ParkingCircle size={36} />
                    <h3>No spaces match just yet</h3>
                    <p>Try a nearby neighbourhood or a different filter.</p>
                    <button
                      className="btn dark"
                      onClick={() => {
                        setQuery("");
                        setSearch("");
                        setFilter("All spaces");
                        setVehicle("Bike");
                      }}
                    >
                      Show all spaces
                    </button>
                  </div>
                ) : (
                  filtered.map((s, i) => (
                    <article
                      key={s.id}
                      className={
                        "parking-card glass " +
                        (selected?.id === s.id ? "highlighted" : "")
                      }
                    >
                      <div className={"space-art art-" + (i % 3)}>
                        <ParkingCircle size={34} />
                        <span>{s.kind}</span>
                        <div className="art-meta">
                          <span>{s.covered ? "Covered" : "Open air"}</span>
                          <span>
                            {s.ev ? (
                              <Zap size={14} />
                            ) : (
                              <ShieldCheck size={14} />
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="card-content">
                        <div className="card-top">
                          <span className="eyebrow">{s.area}</span>
                          <button
                            className={
                              "icon-btn " +
                              (saved.includes(s.id) ? "is-saved" : "")
                            }
                            aria-label={`${saved.includes(s.id) ? "Unsave" : "Save"} ${s.name}`}
                            onClick={() => save(s.id)}
                          >
                            <Bookmark
                              size={18}
                              fill={
                                saved.includes(s.id) ? "currentColor" : "none"
                              }
                            />
                          </button>
                        </div>
                        <button
                          className="title-button"
                          onClick={() => {
                            setSelected(s);
                            setModal("detail");
                          }}
                        >
                          <h3>{s.name}</h3>
                        </button>
                        <p className="address">
                          <MapPin size={13} />
                          {s.address}
                        </p>
                        <div className="features">
                          <span>
                            <Car size={14} /> Up to {s.vehicle}
                          </span>
                          <span>
                            <ShieldCheck size={14} /> Entry pass
                          </span>
                        </div>
                        <div className="card-bottom">
                          <div>
                            <strong>
                              {money(s.price)}
                              <small> / hour</small>
                            </strong>
                            <span>
                              {money(s.price * duration)} for {duration} hours
                            </span>
                          </div>
                          <button
                            className="btn outline small"
                            disabled={!s.available}
                            onClick={() => {
                              setSelected(s);
                              setModal("detail");
                            }}
                          >
                            {s.available ? "View space" : "Unavailable"}
                            <ArrowUpRight size={16} />
                          </button>
                        </div>
                        <p
                          className={
                            "availability " +
                            (!s.available ? "unavailable" : "")
                          }
                        >
                          <span />
                          {s.available} of {s.capacity} spaces available
                        </p>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <div className={"map-panel " + (mobileMap ? "mobile-shown" : "")}>
                <div className="map-caption glass">
                  <MapPin size={15} />
                  {search || "Hyderabad"}
                  <span>Explore nearby</span>
                </div>
                <MapContainer
                  center={center}
                  zoom={14}
                  zoomControl={false}
                  scrollWheelZoom={false}
                >
                  <Recenter center={center} visible={mobileMap} />
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {filtered.map((s) => (
                    <Marker
                      key={s.id}
                      position={[s.lat, s.lng]}
                      icon={L.divIcon({
                        className: "price-marker",
                        html: `<span>₹${s.price}</span>`,
                        iconSize: [64, 38],
                        iconAnchor: [32, 38],
                      })}
                      eventHandlers={{
                        click: () => {
                          setSelected(s);
                          setModal("detail");
                        },
                      }}
                    >
                      <Popup>{s.name}</Popup>
                    </Marker>
                  ))}
                </MapContainer>
                <div className="map-bottom glass">
                  <span className="map-key" />
                  <span>Choose a price pin to explore a space</span>
                  <LocateFixed size={17} />
                </div>
              </div>
            </section>
            <section className="event-banner glass">
              <div className="event-icon">
                <Users size={26} />
              </div>
              <div>
                <span className="eyebrow">THE WHOLE GUEST LIST. SORTED.</span>
                <h3>
                  A place for everyone <em>you invite.</em>
                </h3>
                <p>
                  Reserve nearby spaces, share one link, and let your guests
                  arrive easy.
                </p>
              </div>
              <button className="btn dark" onClick={() => navigate("events")}>
                Plan event parking
                <ArrowUpRight size={17} />
              </button>
            </section>
          </>
        )}
        {page === "bookings" && (
          <>
            <section className="page-intro compact">
              <div>
                <div className="eyebrow">YOUR NEXT STOP</div>
                <h1>
                  Places to <em>be.</em>
                </h1>
                <p>Your reservations and entry passes, all together.</p>
              </div>
            </section>
            <div className="booking-grid">
              {bookings.length ? (
                bookings.map((b) => (
                  <article className="glass booking-card" key={b.id}>
                    <div className="card-top">
                      <span
                        className={
                          "badge " + (b.status === "cancelled" ? "neutral" : "")
                        }
                      >
                        {b.status}
                      </span>
                      <Ticket size={24} />
                    </div>
                    <h2>{b.name}</h2>
                    <p>{b.area}</p>
                    <div className="booking-time">
                      <CalendarDays size={19} />
                      <div>
                        {dateLabel(b.start)}
                        <br />
                        <span>Until {dateLabel(b.end)}</span>
                      </div>
                    </div>
                    <div className="card-bottom">
                      <strong>{b.plate}</strong>
                      <span>
                        {b.event_id ? "Hosted parking" : money(b.total)}
                      </span>
                    </div>
                    <button
                      className="btn dark wide"
                      disabled={b.status === "cancelled"}
                      onClick={() => {
                        setPass(b);
                        setModal("pass");
                      }}
                    >
                      View parking pass
                      <ArrowRight size={17} />
                    </button>
                    {b.status === "confirmed" && (
                      <button
                        className="text-btn"
                        onClick={() => {
                          setPass(b);
                          setModal("cancel");
                        }}
                      >
                        Cancel reservation
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <Empty
                  title="Your next stop starts here"
                  text="Reserve a space and your parking pass will appear here."
                  button="Find parking"
                  onClick={() => navigate("discover")}
                />
              )}
            </div>
          </>
        )}
        {page === "events" && (
          <>
            <section className="page-intro compact">
              <div>
                <div className="eyebrow">ONE INVITE. EVERYONE PARKED.</div>
                <h1>
                  Make room for <em>everyone.</em>
                </h1>
                <p>
                  Book spaces for your event. Your guests just bring themselves.
                </p>
              </div>
              <button
                className="btn dark"
                onClick={() => {
                  setError("");
                  setModal("event");
                }}
              >
                <Plus size={18} />
                Create an event
              </button>
            </section>
            <div className="steps glass">
              {[
                [
                  "01",
                  "Reserve nearby spaces",
                  "Set a time and select parking locations.",
                ],
                [
                  "02",
                  "Send one invitation",
                  "Add your parking link to the guest invite.",
                ],
                [
                  "03",
                  "Welcome your guests",
                  "Guests claim compatible spaces and get a pass.",
                ],
              ].map(([n, t, d]) => (
                <div key={n}>
                  <span>{n}</span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              ))}
            </div>
            <div className="section-head">
              <h2>Your events</h2>
              <span>{events.length} planned</span>
            </div>
            <div className="booking-grid">
              {events.length ? (
                events.map((e) => (
                  <article className="glass booking-card" key={e.id}>
                    <div className="card-top">
                      <span className="badge">
                        {e.quantity - e.claimed} spaces left
                      </span>
                      <Users size={23} />
                    </div>
                    <h2>{e.name}</h2>
                    <p>{e.venue}</p>
                    <p className="booking-time">{dateLabel(e.start)}</p>
                    <div className="capacity">
                      <span
                        style={{ width: `${(100 * e.claimed) / e.quantity}%` }}
                      />
                    </div>
                    <p>
                      {e.claimed} of {e.quantity} passes claimed
                    </p>
                    <button
                      className="btn dark wide"
                      onClick={() => copyInvite(e)}
                    >
                      <Copy size={16} />
                      Copy invite link
                    </button>
                    <button
                      className="text-btn"
                      onClick={() => {
                        setInvite(e);
                        setModal("invite");
                      }}
                    >
                      Preview guest invitation
                      <ArrowUpRight size={14} />
                    </button>
                  </article>
                ))
              ) : (
                <Empty
                  title="Something worth gathering for?"
                  text="A wedding, a team dinner, a small celebration. Start with a space for every guest."
                  button="Create an event"
                  onClick={() => setModal("event")}
                />
              )}
            </div>
            <button
              className="btn outline"
              onClick={() => {
                navigate("host");
              }}
            >
              <Ticket size={16} />
              Open attendant check-in
            </button>
          </>
        )}
        {page === "host" && (
          <>
            <section className="page-intro compact">
              <div>
                <div className="eyebrow">
                  YOUR SPACE. SOMEONE’S PERFECT SPOT.
                </div>
                <h1>
                  Space to <em>share.</em>
                </h1>
                <p>Turn an available driveway into someone’s easier day.</p>
              </div>
              <button className="btn dark" onClick={() => setModal("listing")}>
                <Plus size={18} />
                List a space
              </button>
            </section>
            <div className="host-summary glass">
              <div>
                <span>Your locations</span>
                <strong>{owner.spaces.length}</strong>
              </div>
              <div>
                <span>Total spaces</span>
                <strong>
                  {owner.spaces.reduce((a, s) => a + s.capacity, 0)}
                </strong>
              </div>
              <div>
                <span>Expected arrivals</span>
                <strong>
                  {
                    owner.arrivals.filter((b) => b.status === "confirmed")
                      .length
                  }
                </strong>
              </div>
              <div>
                <span>Checked in</span>
                <strong>
                  {
                    owner.arrivals.filter((b) => b.status === "checked-in")
                      .length
                  }
                </strong>
              </div>
            </div>
            <div className="host-columns">
              <section>
                <div className="section-head">
                  <h2>Your parking locations</h2>
                </div>
                {owner.spaces.length ? (
                  owner.spaces.map((s) => (
                    <article className="glass owner-card" key={s.id}>
                      <House size={24} />
                      <div>
                        <h3>{s.name}</h3>
                        <p>
                          {s.area} · {s.capacity} spaces · {money(s.price)}/hr
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  <Empty
                    title="Your first space is a good start"
                    text="Add the location, access instructions and vehicle limits. Only list spaces you are authorized to offer."
                    button="List your space"
                    onClick={() => setModal("listing")}
                  />
                )}
              </section>
              <section className="glass attendant">
                <span className="eyebrow">AT THE GATE</span>
                <h2>A smoother welcome.</h2>
                <p>
                  Enter the booking reference from a guest’s pass. You can check
                  in guests for your locations and events.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    action(async () => {
                      const r = await api("/checkin", { id: checkId });
                      setToast(`Checked in ${r.plate}`);
                      setCheckId("");
                      refresh();
                    });
                  }}
                >
                  {field(
                    "Booking reference",
                    <input
                      value={checkId}
                      required
                      onChange={(e) => setCheckId(e.target.value)}
                      placeholder="Paste pass reference"
                    />,
                  )}
                  <button className="btn dark wide" disabled={busy}>
                    Verify & check in
                    <Check size={16} />
                  </button>
                </form>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <p className="fine">
                  Online verification required. Opens 30 minutes before arrival.
                </p>
              </section>
            </div>
            <div className="section-head">
              <h2>Guest arrivals</h2>
            </div>
            <div className="table-wrap glass">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Location</th>
                    <th>Arrival</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {owner.arrivals.length ? (
                    owner.arrivals.map((b) => (
                      <tr key={b.id}>
                        <td>{b.plate}</td>
                        <td>{b.name}</td>
                        <td>{dateLabel(b.start)}</td>
                        <td>{b.status}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4}>No guest arrivals yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
      <footer>
        <button className="brand" onClick={() => navigate("discover")}>
          Park<span className="serif">ly</span>
        </button>
        <span>A space for your everyday plans.</span>
        <span>
          Made for Hyderabad <span className="footer-dot">✳</span>
        </span>
      </footer>
      {toast && (
        <div className="toast glass" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "detail"
                ? "Parking space details"
                : modal === "pass"
                  ? "Parking pass"
                  : modal === "event"
                    ? "Create event"
                    : modal === "listing"
                      ? "List a space"
                      : "Parking dialog"
            }
            className={"modal glass " + (modal === "pass" ? "pass-modal" : "")}
          >
            <button
              autoFocus
              className="icon-btn close"
              onClick={close}
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>
            {modal === "detail" && selected && (
              <>
                <span className="eyebrow">
                  {selected.kind} · {selected.area}
                </span>
                <h2>{selected.name}</h2>
                <p>
                  <MapPin size={16} />
                  {selected.address}
                </p>
                <div className="detail-spec">
                  <span>
                    <Car /> Up to {selected.vehicle}
                  </span>
                  <span>
                    <House />
                    {selected.covered ? "Covered" : "Open air"}
                  </span>
                  <span>
                    <ParkingCircle />
                    {selected.available} available
                  </span>
                </div>
                <h3>Arrive with confidence</h3>
                <p>{selected.instructions}</p>
                <a
                  className="text-btn"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
                >
                  View entrance on Google Maps
                  <ArrowUpRight size={16} />
                </a>
                <div className="reservation-summary">
                  <span>
                    {dateLabel(start)} → {dateLabel(end)}
                  </span>
                  <strong>
                    {money(selected.price * duration)}{" "}
                    <small>total · {duration} hours</small>
                  </strong>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    reserve();
                  }}
                >
                  {field(
                    "Your vehicle",
                    <select
                      value={vehicle}
                      onChange={(e) => setVehicle(e.target.value)}
                    >
                      {vehicleTypes.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>,
                  )}
                  {field(
                    "Vehicle registration",
                    <input
                      required
                      minLength={6}
                      maxLength={16}
                      value={plate}
                      onChange={(e) => setPlate(e.target.value)}
                      placeholder="TS 09 AB 1234"
                    />,
                  )}
                  <p className="fine">
                    Demo reservation only. No payment will be taken.
                  </p>
                  <button
                    className="btn dark wide"
                    disabled={busy || !selected.available}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <ShieldCheck size={17} />
                    )}
                    Reserve this space
                    <ArrowRight size={17} />
                  </button>
                </form>
              </>
            )}
            {modal === "pass" && pass && (
              <>
                <div className="pass-heading">
                  <span className="badge">
                    <Check size={13} /> {pass.status}
                  </span>
                  <h2>
                    You have a <em>space.</em>
                  </h2>
                  <p>{pass.name}</p>
                </div>
                <div className="qr">
                  <QRCodeSVG
                    value={JSON.stringify({ type: "parkly-pass", id: pass.id })}
                    size={184}
                    level="M"
                    marginSize={2}
                  />
                </div>
                <strong className="plate">{pass.plate}</strong>
                <div className="pass-dates">
                  <div>
                    <span>ARRIVING</span>
                    <strong>{dateLabel(pass.start)}</strong>
                  </div>
                  <div>
                    <span>LEAVING</span>
                    <strong>{dateLabel(pass.end)}</strong>
                  </div>
                </div>
                <p>{pass.instructions}</p>
                <a
                  className="btn dark wide"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${pass.lat},${pass.lng}`}
                >
                  <Navigation size={17} />
                  Navigate to entrance
                  <ArrowUpRight size={17} />
                </a>
                <button
                  className="text-btn"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(pass.id);
                      setToast("Booking reference copied");
                    } catch {
                      setError("Copy the reference shown below.");
                    }
                  }}
                >
                  <Copy size={14} />
                  Copy booking reference
                </button>
                <code className="reference">{pass.id}</code>
                <p className="fine">
                  Save a screenshot for arrival. The attendant verifies your
                  pass online.
                </p>
              </>
            )}
            {modal === "cancel" && pass && (
              <>
                <h2>Release this space?</h2>
                <p>
                  Your reservation at {pass.name} will be cancelled and the
                  space made available again. No payment was taken.
                </p>
                <button
                  className="btn dark wide"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      await api("/bookings/" + pass.id + "/cancel", {});
                      await refresh();
                      close();
                      setToast("Reservation cancelled");
                    })
                  }
                >
                  Cancel reservation
                </button>
                <button className="btn outline wide" onClick={close}>
                  Keep my space
                </button>
              </>
            )}
            {modal === "event" && (
              <>
                <span className="eyebrow">PARKING, ON THE INVITE</span>
                <h2>
                  Plan your <em>gathering.</em>
                </h2>
                <p>
                  Choose locations in nearest-first order. Guests receive the
                  first compatible available space.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    action(async () => {
                      await api("/events", {
                        ...newEvent,
                        start: new Date(start).toISOString(),
                        end: new Date(end).toISOString(),
                      });
                      await refresh();
                      close();
                      setToast("Event created. Your parking is reserved.");
                      navigate("events");
                    });
                  }}
                >
                  {field(
                    "Event name",
                    <input
                      required
                      value={newEvent.name}
                      onChange={(e) =>
                        setNewEvent({ ...newEvent, name: e.target.value })
                      }
                      placeholder="Ayesha & Arjun’s reception"
                    />,
                  )}
                  {field(
                    "Venue / neighbourhood",
                    <input
                      required
                      value={newEvent.venue}
                      onChange={(e) =>
                        setNewEvent({ ...newEvent, venue: e.target.value })
                      }
                    />,
                  )}
                  <div className="form-row">
                    {field(
                      "Parking starts",
                      <input
                        type="datetime-local"
                        required
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                      />,
                    )}
                    {field(
                      "Parking ends",
                      <input
                        type="datetime-local"
                        required
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                      />,
                    )}
                  </div>
                  {field(
                    "Spaces to reserve",
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      value={newEvent.quantity}
                      onChange={(e) =>
                        setNewEvent({ ...newEvent, quantity: +e.target.value })
                      }
                    />,
                  )}
                  <h3>Choose parking locations</h3>
                  <div className="location-choices">
                    {spaces.map((s) => (
                      <label key={s.id}>
                        <input
                          type="checkbox"
                          checked={newEvent.spaceIds.includes(s.id)}
                          onChange={(e) =>
                            setNewEvent({
                              ...newEvent,
                              spaceIds: e.target.checked
                                ? [...newEvent.spaceIds, s.id]
                                : newEvent.spaceIds.filter((id) => id !== s.id),
                            })
                          }
                        />
                        <span>
                          <strong>{s.name}</strong>
                          <small>
                            {s.area} · {s.capacity} total spaces ·{" "}
                            {money(s.price)}/hr
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="fine">
                    Availability is checked at reservation time. Demo host-paid
                    allocation; no funds are collected.
                  </p>
                  <button className="btn dark wide" disabled={busy}>
                    Reserve & create invite
                    <ArrowRight size={17} />
                  </button>
                </form>
              </>
            )}
            {modal === "invite" && invite && (
              <>
                <span className="badge">YOU’RE INVITED</span>
                <h2>{invite.name}</h2>
                <p>{invite.venue}</p>
                <div className="reservation-summary">
                  <span>
                    {dateLabel(invite.start)} → {dateLabel(invite.end)}
                  </span>
                  <strong>
                    {invite.quantity - invite.claimed}{" "}
                    <small>spaces left · parking on your host</small>
                  </strong>
                </div>
                <p>
                  Claim a space that fits your vehicle. Your host has arranged
                  the locations in preferred order.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    reserve(invite.id);
                  }}
                >
                  {field(
                    "Your vehicle",
                    <select
                      value={vehicle}
                      onChange={(e) => setVehicle(e.target.value)}
                    >
                      {vehicleTypes.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>,
                  )}
                  {field(
                    "Vehicle registration",
                    <input
                      required
                      minLength={6}
                      maxLength={16}
                      value={plate}
                      onChange={(e) => setPlate(e.target.value)}
                      placeholder="TS 09 AB 1234"
                    />,
                  )}
                  <button
                    className="btn dark wide"
                    disabled={busy || invite.claimed >= invite.quantity}
                  >
                    {invite.claimed >= invite.quantity
                      ? "All spaces claimed"
                      : "Claim my parking pass"}
                    <ArrowRight size={17} />
                  </button>
                </form>
              </>
            )}
            {modal === "share" && invite && (
              <>
                <h2>Your invitation link</h2>
                {field(
                  "Copy and share with guests",
                  <input
                    readOnly
                    value={location.origin + "/?invite=" + invite.id}
                    onFocus={(e) => e.target.select()}
                  />,
                )}
              </>
            )}
            {modal === "listing" && (
              <>
                <span className="eyebrow">MAKE SPACE FOR SOMEONE</span>
                <h2>
                  A spot worth <em>sharing.</em>
                </h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    action(async () => {
                      await api("/spaces", listing);
                      await refresh();
                      close();
                      setToast("Your space is listed");
                    });
                  }}
                >
                  <label className="upload">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) analyze(f);
                      }}
                    />
                    {preview ? (
                      <img src={preview} alt="Your parking area" />
                    ) : (
                      <Upload size={26} />
                    )}
                    <strong>
                      {aiBusy
                        ? "Analyzing on your device…"
                        : "Add a photo · try local AI"}
                    </strong>
                    <span>
                      Private scene classification. The image stays on your
                      device.
                    </span>
                  </label>
                  {aiStatus && (
                    <p className="ai-note">
                      <Sparkles size={17} />
                      {aiStatus}
                    </p>
                  )}
                  <p className="fine">
                    Optional MobileViT image classification runs in your browser
                    (CPU/WASM). It does not measure spaces or verify vehicle
                    fit. The photo is used for this analysis only and is not
                    saved to the listing.
                  </p>
                  {field(
                    "Listing name",
                    <input
                      required
                      value={listing.name}
                      onChange={(e) =>
                        setListing({ ...listing, name: e.target.value })
                      }
                      placeholder="My driveway on Road 36"
                    />,
                  )}
                  <div className="form-row">
                    {field(
                      "Neighbourhood",
                      <select
                        value={listing.area}
                        onChange={(e) =>
                          setListing({
                            ...listing,
                            area: e.target.value,
                            lat: areaCenters[e.target.value][0],
                            lng: areaCenters[e.target.value][1],
                          })
                        }
                      >
                        {Object.keys(areaCenters).map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>,
                    )}
                    {field(
                      "Largest vehicle supported",
                      <select
                        value={listing.vehicle}
                        onChange={(e) =>
                          setListing({ ...listing, vehicle: e.target.value })
                        }
                      >
                        {vehicleTypes.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>,
                    )}
                  </div>
                  {field(
                    "Entrance address",
                    <input
                      required
                      value={listing.address}
                      onChange={(e) =>
                        setListing({ ...listing, address: e.target.value })
                      }
                    />,
                  )}
                  <div className="form-row">
                    {field(
                      "Entrance latitude",
                      <input
                        type="number"
                        step="any"
                        required
                        value={listing.lat}
                        onChange={(e) =>
                          setListing({ ...listing, lat: +e.target.value })
                        }
                      />,
                    )}
                    {field(
                      "Entrance longitude",
                      <input
                        type="number"
                        step="any"
                        required
                        value={listing.lng}
                        onChange={(e) =>
                          setListing({ ...listing, lng: +e.target.value })
                        }
                      />,
                    )}
                  </div>
                  <div className="form-row">
                    {field(
                      "Price per hour (₹)",
                      <input
                        required
                        type="number"
                        min="1"
                        max="10000"
                        value={listing.price}
                        onChange={(e) =>
                          setListing({ ...listing, price: +e.target.value })
                        }
                      />,
                    )}
                    {field(
                      "Number of spaces",
                      <input
                        required
                        type="number"
                        min="1"
                        max="100"
                        value={listing.capacity}
                        onChange={(e) =>
                          setListing({ ...listing, capacity: +e.target.value })
                        }
                      />,
                    )}
                  </div>
                  <div className="checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={listing.covered}
                        onChange={(e) =>
                          setListing({ ...listing, covered: e.target.checked })
                        }
                      />
                      Covered
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={listing.ev}
                        onChange={(e) =>
                          setListing({ ...listing, ev: e.target.checked })
                        }
                      />
                      EV charging available
                    </label>
                  </div>
                  {field(
                    "Access instructions",
                    <textarea
                      required
                      value={listing.instructions}
                      onChange={(e) =>
                        setListing({ ...listing, instructions: e.target.value })
                      }
                      placeholder="Which gate? Who should the driver meet?"
                    />,
                  )}
                  <label className="consent">
                    <input type="checkbox" required />I am authorized to offer
                    this space and have verified vehicle access and capacity.
                  </label>
                  <p className="fine">
                    Preview listings are available at all times. Availability
                    schedules and payouts are not enabled.
                  </p>
                  <button className="btn dark wide" disabled={busy}>
                    Publish demo listing
                    <ArrowRight size={17} />
                  </button>
                </form>
              </>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function Empty({
  title,
  text,
  button,
  onClick,
}: {
  title: string;
  text: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <div className="empty glass">
      <ParkingCircle size={35} />
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="btn dark" onClick={onClick}>
        {button}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
