import { NavigationBar } from "./shared/NavigationBar";
import { Chakra } from "./shared/Chakra";
import { distanceKm, nearbyRadiusKm } from "./shared/location.mjs";
import { Availability, type Block } from "./host/Availability";
import { api } from "./shared/api";
import type { User } from "./auth/AuthRoot";
import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Search,
  MapPin,
  ArrowUpRight,
  ArrowRight,
  Car,
  Camera,
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
  Sparkles,
  LoaderCircle,
  Upload,
  Share2,
  ChevronRight,
  Map as MapIcon,
  List,
  LogOut,
  ScanLine,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
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
  daily_rate: number;
  monthly_rate: number;
  status: string;
  quote?: { total: number; rate: number; unit: string; label: string };
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
const scheduleLabel = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    weekday: "short",
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
    const resize = () => {
      map.invalidateSize();
      map.setView(center, 14);
    };
    const id = requestAnimationFrame(resize);
    const first = window.setTimeout(resize, 120);
    const settled = window.setTimeout(resize, 420);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(first);
      window.clearTimeout(settled);
    };
  }, [center[0], center[1], visible]);
  return null;
}
export default function App({
  user,
  mode,
  accountControls,
}: {
  user: User;
  mode: "driver" | "host";
  accountControls: React.ReactNode;
}) {
  const [hostTab, setHostTab] = useState("dashboard");
  const [editingSpace, setEditingSpace] = useState<string | null>(null);
  const scanVideoRef = React.useRef<HTMLVideoElement>(null);
  const [onboarding, setOnboarding] = useState(
    () =>
      mode === "driver" && !new URLSearchParams(location.search).get("invite"),
  );
  const onboardingStep = 2,
    onboardingDirection = "next";
  const [page, setPage] = useState(
      mode === "host"
        ? "host"
        : {
            "/app/bookings": "bookings",
            "/app/events": "events",
            "/app/saved": "saved",
          }[location.pathname] || "discover",
    ),
    [query, setQuery] = useState("Jubilee Hills"),
    [search, setSearch] = useState("Jubilee Hills"),
    [start, setStart] = useState(localDate(initialStart)),
    [end, setEnd] = useState(localDate(new Date(+initialStart + 3 * 3600000))),
    [vehicle, setVehicle] = useState("Sedan");
  const [spaces, setSpaces] = useState<Space[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [owner, setOwner] = useState<{
      spaces: Space[];
      arrivals: Booking[];
      blocks: Block[];
    }>({
      spaces: [],
      arrivals: [],
      blocks: [],
    });
  const [saved, setSaved] = useState<string[]>(
      JSON.parse(localStorage.getItem("parkly-saved-" + user.id) || "[]"),
    ),
    [selected, setSelected] = useState<Space | null>(null),
    [modal, setModal] = useState(""),
    [pass, setPass] = useState<Booking | null>(null),
    [plate, setPlate] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [loading, setLoading] = useState(true),
    [sort, setSort] = useState("Recommended"),
    [sortOpen, setSortOpen] = useState(false),
    [mobileMap, setMobileMap] = useState(false),
    [userLocation, setUserLocation] = useState<[number, number] | null>(null),
    [locating, setLocating] = useState(false),
    [nearby, setNearby] = useState(false),
    [mapFocus, setMapFocus] = useState<Space | null>(null),
    [scheduleField, setScheduleField] = useState<"start" | "end" | null>(null),
    [draftDate, setDraftDate] = useState(""),
    [draftTime, setDraftTime] = useState(""),
    [requirements, setRequirements] = useState({
      covered: false,
      ev: false,
      budget: false,
    }),
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
    daily_rate: 320,
    monthly_rate: 4800,
    capacity: 1,
    vehicle: "Sedan",
    covered: false,
    ev: false,
    instructions: "",
  });
  const [aiStatus, setAiStatus] = useState(""),
    [aiBusy, setAiBusy] = useState(false),
    [aiReady, setAiReady] = useState(false),
    [preview, setPreview] = useState(""),
    [scanOpen, setScanOpen] = useState(false),
    [scanError, setScanError] = useState("");
  function navigate(p: string) {
    if (mode === "host" && p !== "host") return;
    if (mode === "driver" && p === "host") return;
    setPage(p);
    history.pushState(
      {},
      "",
      p === "host"
        ? "/host/dashboard"
        : "/app/" + (p === "discover" ? "search" : p),
    );
    setSortOpen(false);
    setError("");
    window.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }
  useEffect(() => {
    const handleRoute = () => {
      if (mode === "host") {
        setPage("host");
        setHostTab(location.pathname.split("/")[2] || "dashboard");
      } else
        setPage(
          (
            {
              "/app/bookings": "bookings",
              "/app/events": "events",
              "/app/saved": "saved",
            } as Record<string, string>
          )[location.pathname] || "discover",
        );
      setModal("");
      window.scrollTo(0, 0);
    };
    handleRoute();
    window.addEventListener("popstate", handleRoute);
    return () => window.removeEventListener("popstate", handleRoute);
  }, [mode]);
  function locateUser() {
    if (!navigator.geolocation) {
      setError("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation([coords.latitude, coords.longitude]);
        setNearby(true);
        setQuery("Current location");
        setSearch("");
        setMapFocus(null);
        setError("");
        setLocating(false);
      },
      (failure) => {
        setLocating(false);
        setError(
          failure.code === 1
            ? "Location access is blocked. Allow it in your device settings or enter a destination."
            : "Couldn’t get your location. Try again or enter a destination.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }
  function finishOnboarding() {
    setOnboarding(false);
    window.scrollTo(0, 0);
  }
  function openSchedule(field: "start" | "end") {
    const [date, time] = (field === "start" ? start : end).split("T");
    setDraftDate(date);
    setDraftTime(time.slice(0, 5));
    setScheduleField(field);
  }
  function applySchedule() {
    if (!scheduleField || !draftDate || !draftTime) return;
    const next = `${draftDate}T${draftTime}`;
    if (scheduleField === "start") {
      setStart(next);
      if (+new Date(next) >= +new Date(end))
        setEnd(localDate(new Date(+new Date(next) + 3 * 3600000)));
    } else {
      if (+new Date(next) <= +new Date(start)) {
        setError("Leaving time must be after your arrival.");
        return;
      }
      setEnd(next);
    }
    setError("");
    setScheduleField(null);
  }
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "auto" });
    const id = window.setTimeout(
      () => window.scrollTo({ top: 0, behavior: "auto" }),
      0,
    );
    return () => window.clearTimeout(id);
  }, [page]);
  async function refresh() {
    setLoading(true);
    try {
      const [s, b, e, o] = await Promise.all([
        api(
          `/spaces?start=${encodeURIComponent(new Date(start).toISOString())}&end=${encodeURIComponent(new Date(end).toISOString())}`,
        ),
        mode === "driver" ? api("/bookings") : Promise.resolve([]),
        mode === "driver" ? api("/events") : Promise.resolve([]),
        mode === "host"
          ? api("/owner")
          : Promise.resolve({ spaces: [], arrivals: [], blocks: [] }),
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
    const id =
      mode === "driver"
        ? new URLSearchParams(location.search).get("invite")
        : null;
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
    if (!error || modal || scheduleField) return;
    const t = setTimeout(() => setError(""), 5200);
    return () => clearTimeout(t);
  }, [error, modal, scheduleField]);
  useEffect(() => {
    document.body.style.overflow =
      onboarding || modal || scheduleField || scanOpen ? "hidden" : "";
    const blocked = Boolean(onboarding || modal || scheduleField || scanOpen);
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".account-bar, .nav-shell, main#main, footer",
      ),
    );
    background.forEach((el) => {
      el.inert = blocked;
    });
    const focusTimer = window.setTimeout(() => {
      if (blocked)
        document
          .querySelector<HTMLElement>(
            "[role=dialog] button:not(:disabled), [role=dialog] input, [role=dialog] select",
          )
          ?.focus();
    }, 0);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        setScheduleField(null);
        setScanOpen(false);
      }
      if (
        e.key === "Tab" &&
        (modal || onboarding || scheduleField || scanOpen)
      ) {
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
    return () => {
      window.removeEventListener("keydown", esc);
      window.clearTimeout(focusTimer);
      background.forEach((el) => {
        el.inert = false;
      });
      document.body.style.overflow = "";
    };
  }, [modal, onboarding, scheduleField, scanOpen]);
  useEffect(() => {
    if (!scanOpen) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let frame = 0;
    const scan = async () => {
      const Detector = (window as any).BarcodeDetector;
      if (!Detector) {
        setScanError(
          "QR scanning is not supported here. Use the manual field below.",
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!scanVideoRef.current) return;
        scanVideoRef.current.srcObject = stream;
        await scanVideoRef.current.play();
        const detector = new Detector({ formats: ["qr_code"] });
        const read = async () => {
          if (stopped || !scanVideoRef.current) return;
          try {
            const codes = await detector.detect(scanVideoRef.current);
            const value = codes[0]?.rawValue;
            if (value) {
              let id = value;
              try {
                const payload = JSON.parse(value);
                if (payload.type === "parkly-pass") id = payload.id;
              } catch {
                // Accept a plain booking reference as a scanner fallback.
              }
              if (id) {
                setCheckId(id);
                setScanOpen(false);
                setToast("Pass scanned. Ready to verify.");
                return;
              }
            }
          } catch {
            setScanError("Keep the QR code inside the frame and try again.");
          }
          frame = window.setTimeout(read, 160);
        };
        read();
      } catch {
        setScanError(
          "Camera access was blocked. Allow camera access or use the manual field below.",
        );
      }
    };
    scan();
    return () => {
      stopped = true;
      window.clearTimeout(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (scanVideoRef.current) scanVideoRef.current.srcObject = null;
    };
  }, [scanOpen]);
  function close() {
    setModal("");
    setSelected(null);
    setPass(null);
    setError("");
  }
  async function checkIn() {
    if (!checkId) return;
    await action(async () => {
      const r = await api("/checkin", { id: checkId });
      setToast(`Checked in ${r.plate}`);
      setCheckId("");
      refresh();
    });
  }
  function save(id: string) {
    const a = saved.includes(id)
      ? saved.filter((s) => s !== id)
      : [...saved, id];
    setSaved(a);
    localStorage.setItem("parkly-saved-" + user.id + "", JSON.stringify(a));
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
      const createdPass = all.find((x: Booking) => x.id === b.id) as Booking;
      setBookings(all);
      setPass(createdPass);
      setModal("pass");
      await refresh();
      try {
        await sharePassPdf(createdPass);
        setToast("Reserved. Your PDF pass is ready to share");
      } catch {
        setToast("Reserved. Open the pass to share its PDF");
      }
    });
  }
  async function sharePassPdf(booking: Booking) {
    const qrValue = JSON.stringify({ type: "parkly-pass", id: booking.id });
    const qrData = await QRCode.toDataURL(qrValue, {
      width: 480,
      margin: 2,
      color: { dark: "#09111f", light: "#ffffff" },
    });
    const doc = new jsPDF({ unit: "mm", format: "a5" });
    doc.setFillColor(244, 247, 251);
    doc.rect(0, 0, 148, 210, "F");
    doc.setTextColor(9, 17, 31);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text("Parkly", 16, 22);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(69, 84, 104);
    doc.text("CONFIRMED PARKING PASS", 16, 31);
    doc.setTextColor(9, 17, 31);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text(booking.name, 16, 48, { maxWidth: 80 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(69, 84, 104);
    doc.text(booking.address, 16, 60, { maxWidth: 80 });
    doc.addImage(qrData, "PNG", 98, 38, 34, 34);
    doc.setDrawColor(210, 220, 232);
    doc.line(16, 80, 132, 80);
    doc.setTextColor(9, 17, 31);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.text(booking.plate, 16, 94);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(69, 84, 104);
    doc.text(`Arrive: ${dateLabel(booking.start)}`, 16, 108);
    doc.text(`Leave: ${dateLabel(booking.end)}`, 16, 116);
    doc.text(booking.instructions, 16, 132, { maxWidth: 116 });
    doc.setFontSize(8);
    doc.text(`Booking reference: ${booking.id}`, 16, 190);
    doc.text("Demo pass · Online verification required", 16, 198);
    const safePlate = booking.plate.replace(/[^A-Z0-9]/gi, "-");
    const fileName = `Parkly-${safePlate}.pdf`;
    if (Capacitor.isNativePlatform()) {
      const data = doc.output("datauristring").split(",")[1];
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data,
        directory: Directory.Cache,
      });
      await Share.share({
        title: "Parkly parking pass",
        text: `${booking.name} · ${booking.plate}`,
        url: savedFile.uri,
        dialogTitle: "Send or save your parking pass",
      });
      return;
    }
    doc.save(fileName);
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
    setAiReady(false);
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
      setAiReady(true);
      await model.dispose();
    } catch {
      setAiStatus(
        "The local vision check could not finish. Check connectivity and try the photo again before publishing.",
      );
      setAiReady(false);
    } finally {
      setAiBusy(false);
    }
  }
  const needle = search.toLowerCase();
  let filtered = spaces.filter(
    (s) =>
      (page !== "saved" || saved.includes(s.id)) &&
      (page === "saved" ||
        nearby ||
        !needle ||
        `${s.name} ${s.area} ${s.address}`.toLowerCase().includes(needle)) &&
      (page === "saved" ||
        !nearby ||
        !userLocation ||
        distanceKm(userLocation, [s.lat, s.lng]) <= nearbyRadiusKm) &&
      vehicleTypes.indexOf(vehicle) <= vehicleTypes.indexOf(s.vehicle) &&
      (!requirements.covered || s.covered) &&
      (!requirements.ev || s.ev) &&
      (!requirements.budget || s.price < 40),
  );
  filtered = [...filtered].sort((a, b) =>
    sort === "Price: low to high"
      ? a.price - b.price
      : sort === "Most availability"
        ? b.available - a.available
        : nearby && userLocation
          ? distanceKm(userLocation, [a.lat, a.lng]) -
            distanceKm(userLocation, [b.lat, b.lng])
          : 0,
  );
  const center: [number, number] =
    nearby && userLocation
      ? userLocation
      : areaCenters[search] || [17.433, 78.407];
  const pricing = (space: Space) =>
    space.quote || {
      total: 0,
      rate: space.price,
      unit: "/ hour",
      label: "quote pending",
    };
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
      <NavigationBar
        mode={mode}
        active={page}
        onNavigate={navigate}
        account={accountControls}
        mapHidden={page === "discover" && mobileMap}
      />
      <main
        id="main"
        className={page === "discover" && mobileMap ? "map-active" : ""}
      >
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
                      Park closer.
                      <br />
                      Arrive <em>calmer.</em>
                    </>
                  )}
                </h1>
                <p>
                  {page === "saved"
                    ? "The places you want to come back to."
                    : "Find a verified space before the drive, or reserve parking for every guest."}
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
                <form
                  className="search-fields"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSearch(nearby ? "" : query);
                    refresh();
                  }}
                >
                  <div className="destination-field">
                    <label className="destination">
                      <MapPin size={21} />
                      <span>
                        <small>WHERE ARE YOU HEADED?</small>
                        <input
                          aria-label="Destination"
                          value={query}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            setNearby(false);
                          }}
                          placeholder="Place, neighbourhood or venue"
                        />
                      </span>
                    </label>
                    <button
                      type="button"
                      className="current-location"
                      disabled={locating}
                      onClick={locateUser}
                    >
                      {locating ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Navigation size={16} />
                      )}
                      {locating
                        ? "Finding your location…"
                        : "Use current location"}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="schedule-trigger"
                    onClick={() => openSchedule("start")}
                    aria-label={`Change arrival, currently ${scheduleLabel(start)}`}
                  >
                    <CalendarDays size={19} />
                    <span>
                      <small>ARRIVING</small>
                      <strong>{scheduleLabel(start)}</strong>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  <button
                    type="button"
                    className="schedule-trigger"
                    onClick={() => openSchedule("end")}
                    aria-label={`Change leaving, currently ${scheduleLabel(end)}`}
                  >
                    <Clock size={19} />
                    <span>
                      <small>LEAVING</small>
                      <strong>{scheduleLabel(end)}</strong>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  <button className="btn dark search-btn" type="submit">
                    <Search size={19} />
                    <span>Find a space</span>
                    <ArrowRight size={18} />
                  </button>
                </form>
              </section>
            )}
            <div className="results-top">
              <button
                className="chip map-switch"
                onClick={() => {
                  setMobileMap(!mobileMap);
                  setMapFocus(null);
                  window.scrollTo({ top: 0, behavior: "auto" });
                }}
              >
                {mobileMap ? <List size={15} /> : <MapIcon size={15} />}{" "}
                {mobileMap ? "List" : "Map"}
              </button>
            </div>
            {error && !modal && (
              <div role="alert" className="error transient-error">
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
                        : nearby
                          ? "Near you"
                          : search || "Across Hyderabad"}
                    </h2>
                    <p>
                      {loading
                        ? "Finding your spaces…"
                        : `${filtered.length} places to park`}{" "}
                      <span>· {vehicle}</span>
                    </p>
                  </div>
                  <div className="sort">
                    <button
                      className="text-btn"
                      onClick={() => setModal("preferences")}
                    >
                      Requirements
                    </button>
                    <button
                      className="sort-trigger"
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={sortOpen}
                      onClick={() => setSortOpen(!sortOpen)}
                    >
                      <SlidersHorizontal size={15} />
                      <span>{sort}</span>
                      <ChevronDown size={14} />
                    </button>
                    {sortOpen && (
                      <div
                        className="sort-menu glass"
                        role="listbox"
                        aria-label="Sort parking"
                      >
                        {[
                          "Recommended",
                          "Price: low to high",
                          "Most availability",
                        ].map((option) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={sort === option}
                            className={sort === option ? "selected" : ""}
                            key={option}
                            onClick={() => {
                              setSort(option);
                              setSortOpen(false);
                            }}
                          >
                            <span>{option}</span>
                            {sort === option && <Check size={15} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {loading ? (
                  <div className="loading">
                    <LoaderCircle className="spin" /> Finding a place for your
                    plans…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="empty glass">
                    <ParkingCircle size={36} />
                    <h3>
                      {nearby
                        ? "No matching spaces nearby"
                        : "No spaces match just yet"}
                    </h3>
                    <p>
                      {nearby
                        ? "No matching parking within 10 km. Try another destination or adjust your requirements."
                        : "Try a nearby neighbourhood or different requirements."}
                    </p>
                    <button
                      className="btn dark"
                      onClick={() => {
                        setNearby(false);
                        setQuery("");
                        setSearch("");
                        setVehicle("Bike");
                        setRequirements({
                          covered: false,
                          ev: false,
                          budget: false,
                        });
                      }}
                    >
                      Show all spaces
                    </button>
                  </div>
                ) : (
                  filtered.map((s) => (
                    <article
                      key={s.id}
                      className={
                        "parking-card glass " +
                        (selected?.id === s.id ? "highlighted" : "")
                      }
                      role="button"
                      tabIndex={s.available ? 0 : -1}
                      aria-label={`${s.available ? "View" : "Unavailable"} ${s.name}`}
                      aria-disabled={!s.available}
                      onClick={() => {
                        if (s.available) {
                          setSelected(s);
                          setModal("detail");
                        }
                      }}
                      onKeyDown={(event) => {
                        if (
                          s.available &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          setSelected(s);
                          setModal("detail");
                        }
                      }}
                    >
                      <div className="card-content">
                        <div className="card-top">
                          <span className="eyebrow">{s.area}</span>
                          <button
                            className={
                              "icon-btn " +
                              (saved.includes(s.id) ? "is-saved" : "")
                            }
                            aria-label={`${saved.includes(s.id) ? "Unsave" : "Save"} ${s.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              save(s.id);
                            }}
                          >
                            <Bookmark
                              size={18}
                              fill={
                                saved.includes(s.id) ? "currentColor" : "none"
                              }
                            />
                          </button>
                        </div>
                        <h3 className="card-title">{s.name}</h3>
                        <p className="address">
                          <MapPin size={13} />
                          {s.address}
                        </p>
                        {nearby && userLocation && (
                          <p className="distance-label">
                            {distanceKm(userLocation, [s.lat, s.lng]).toFixed(
                              1,
                            )}{" "}
                            km away
                          </p>
                        )}
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
                              {money(pricing(s).rate)}
                              <small>{pricing(s).unit}</small>
                            </strong>
                            <span>
                              {money(pricing(s).total)} for {pricing(s).label}
                            </span>
                          </div>
                          {!s.available && (
                            <span className="card-unavailable">
                              Unavailable
                            </span>
                          )}
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
                  <span className="map-caption-icon">
                    <MapPin size={16} />
                  </span>
                  <span className="map-caption-copy">
                    <small>SEARCH AREA</small>
                    <strong>
                      {nearby ? "Near you" : search || "Hyderabad"}
                    </strong>
                  </span>
                  <span className="map-count">{filtered.length} spaces</span>
                  <button
                    type="button"
                    className="map-list-button"
                    onClick={() => {
                      setMobileMap(false);
                      window.scrollTo({ top: 0, behavior: "auto" });
                    }}
                  >
                    <List size={16} /> List
                  </button>
                </div>
                <MapContainer
                  key={mobileMap ? "mobile-map" : "desktop-map"}
                  center={center}
                  zoom={14}
                  zoomControl
                  scrollWheelZoom={false}
                >
                  <Recenter center={center} visible={mobileMap} />

                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    detectRetina
                    maxZoom={19}
                  />
                  {filtered.map((s) => (
                    <Marker
                      key={s.id}
                      position={[s.lat, s.lng]}
                      icon={L.divIcon({
                        className: "price-marker",
                        html: `<span>₹${pricing(s).rate}</span>`,
                        iconSize: [64, 38],
                        iconAnchor: [32, 38],
                      })}
                      eventHandlers={{
                        click: () => {
                          setMapFocus(s);
                        },
                      }}
                    >
                      <Popup>{s.name}</Popup>
                    </Marker>
                  ))}
                  {userLocation && (
                    <Marker
                      position={userLocation}
                      icon={L.divIcon({
                        className: "user-location-marker",
                        html: "<span></span>",
                        iconSize: [22, 22],
                        iconAnchor: [11, 11],
                      })}
                    >
                      <Popup>You are here</Popup>
                    </Marker>
                  )}
                </MapContainer>
                <button
                  className={
                    "map-location-button " + (locating ? "locating" : "")
                  }
                  type="button"
                  onClick={locateUser}
                  aria-label="Use my location"
                  title="Use my location"
                >
                  <Navigation size={18} />
                </button>
                {(mapFocus || filtered[0]) && (
                  <div className="map-bottom glass">
                    <span className="map-sheet-handle" />
                    <div className="map-space-copy">
                      <span className="eyebrow">
                        {(mapFocus || filtered[0]).area} ·{" "}
                        {(mapFocus || filtered[0]).available} available
                      </span>
                      <strong>{(mapFocus || filtered[0]).name}</strong>
                      <small>{(mapFocus || filtered[0]).address}</small>
                    </div>
                    <div className="map-space-action">
                      <span>
                        {money(pricing(mapFocus || filtered[0]).rate)}
                        <small>{pricing(mapFocus || filtered[0]).unit}</small>
                      </span>
                      <button
                        className="btn dark"
                        type="button"
                        onClick={() => {
                          setSelected(mapFocus || filtered[0]);
                          setModal("detail");
                        }}
                      >
                        View details <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
            {page === "discover" && (
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
            )}
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
                  onClick={() =>
                    navigate(mode === "host" ? "host" : "discover")
                  }
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
          </>
        )}
        {page === "host" && mode === "host" && (
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
              <button
                className="btn dark"
                onClick={() => {
                  setEditingSpace(null);
                  setAiReady(false);
                  setPreview("");
                  setModal("listing");
                }}
              >
                <Plus size={18} />
                List a space
              </button>
            </section>
            <nav className="host-tabs" aria-label="Host navigation">
              {[
                ["dashboard", "Overview"],
                ["spaces", "My spaces"],
                ["arrivals", "Arrivals"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={hostTab === id ? "selected" : ""}
                  onClick={() => {
                    setHostTab(id);
                    history.pushState({}, "", "/host/" + id);
                    window.scrollTo(0, 0);
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            {hostTab === "dashboard" && (
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
                  <span>Arriving today</span>
                  <strong>
                    {
                      owner.arrivals.filter(
                        (b) =>
                          b.status === "confirmed" &&
                          new Date(b.start).toDateString() ===
                            new Date().toDateString(),
                      ).length
                    }
                  </strong>
                </div>
                <div>
                  <span>Checked in</span>
                  <strong>
                    {
                      owner.arrivals.filter(
                        (b) =>
                          b.status === "checked-in" &&
                          new Date(b.start).toDateString() ===
                            new Date().toDateString(),
                      ).length
                    }
                  </strong>
                </div>
              </div>
            )}
            <div className={"host-columns host-view-" + hostTab}>
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
                          <br />
                          {money(s.daily_rate)}/day · {money(s.monthly_rate)}
                          /month · {s.status?.replaceAll("_", " ")}
                        </p>
                      </div>
                      <div className="host-space-actions">
                        <button
                          className="text-btn"
                          onClick={() => {
                            setListing({
                              ...s,
                              covered: !!s.covered,
                              ev: !!s.ev,
                            });
                            setEditingSpace(s.id);
                            setAiReady(true);
                            setModal("listing");
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-btn"
                          disabled={busy}
                          onClick={() =>
                            action(async () => {
                              await api(
                                "/host/spaces/" + s.id,
                                {
                                  status:
                                    s.status === "active"
                                      ? "paused"
                                      : "pending_review",
                                },
                                "PATCH",
                              );
                              await refresh();
                            })
                          }
                        >
                          {s.status === "active"
                            ? "Pause"
                            : "Submit for review"}
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <Empty
                    title="Your first space is a good start"
                    text="Add the location, access instructions and vehicle limits. Only list spaces you are authorized to offer."
                    button="List your space"
                    onClick={() => {
                      setEditingSpace(null);
                      setAiReady(false);
                      setPreview("");
                      setModal("listing");
                    }}
                  />
                )}
              </section>
              <section className="glass attendant">
                <span className="eyebrow">AT THE GATE</span>
                <h2>A smoother welcome.</h2>
                <p>
                  Scan the QR on a guest’s pass to check them in at your
                  location.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    checkIn();
                  }}
                >
                  <button
                    className="scanner-launch"
                    type="button"
                    onClick={() => {
                      setScanError("");
                      setScanOpen(true);
                    }}
                  >
                    <span className="scanner-icon">
                      <ScanLine size={23} />
                    </span>
                    <span>
                      <strong>Scan guest pass</strong>
                      <small>Use your camera to read the QR code</small>
                    </span>
                    <Camera size={18} />
                  </button>
                  {field(
                    "Or enter reference manually",
                    <input
                      value={checkId}
                      onChange={(e) => setCheckId(e.target.value)}
                      placeholder="Booking ID"
                    />,
                  )}
                  <button className="btn dark wide" disabled={busy || !checkId}>
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
                  The pass is checked online and can only be used during its
                  arrival window.
                </p>
              </section>
            </div>
            {hostTab === "spaces" && (
              <Availability
                spaces={owner.spaces}
                blocks={owner.blocks || []}
                refresh={refresh}
              />
            )}
            {hostTab !== "spaces" && (
              <>
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
          </>
        )}
      </main>
      <footer>
        <button
          className="brand"
          onClick={() => navigate(mode === "host" ? "host" : "discover")}
        >
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
      {scanOpen && (
        <div
          className="overlay scanner-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setScanOpen(false);
          }}
        >
          <section
            className="scanner-modal glass"
            role="dialog"
            aria-modal="true"
            aria-label="Scan guest parking pass"
          >
            <div className="scanner-heading">
              <div>
                <span className="eyebrow">AT THE GATE</span>
                <h2>Scan the guest pass</h2>
              </div>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setScanOpen(false)}
                aria-label="Close scanner"
              >
                <X size={20} />
              </button>
            </div>
            <div className="scanner-frame">
              <video
                ref={scanVideoRef}
                playsInline
                muted
                aria-label="Camera preview"
              />
              <span className="scanner-corner corner-tl" />
              <span className="scanner-corner corner-tr" />
              <span className="scanner-corner corner-bl" />
              <span className="scanner-corner corner-br" />
              <span className="scanner-line" />
            </div>
            <p className="scanner-hint">
              Center the QR code from the guest’s parking pass inside the frame.
            </p>
            {scanError && (
              <p className="error" role="alert">
                {scanError}
              </p>
            )}
            <button
              className="text-btn"
              type="button"
              onClick={() => setScanOpen(false)}
            >
              Use the manual reference instead
            </button>
          </section>
        </div>
      )}
      {onboarding && (
        <div className="onboarding-shell" role="presentation">
          <div className="onboarding-backdrop">
            <Chakra />
          </div>
          <section
            className="onboarding-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
          >
            <div
              key={onboardingStep}
              className={`onboarding-slide onboarding-slide-${onboardingDirection}`}
              aria-live="polite"
            >
              {onboardingStep === 2 && (
                <>
                  <div className="onboarding-art onboarding-art-preferences">
                    <Car size={40} />
                    <span>YOUR PARKING PROFILE</span>
                  </div>
                  <span className="eyebrow">MAKE PARKING FIT</span>
                  <h1 id="onboarding-title">
                    What do you need
                    <br />
                    <em>today?</em>
                  </h1>
                  <p>Choose your vehicle and parking preferences.</p>
                  <form
                    className="onboarding-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      finishOnboarding();
                    }}
                  >
                    {field(
                      "Vehicle type",
                      <select
                        value={vehicle}
                        onChange={(event) => setVehicle(event.target.value)}
                      >
                        {vehicleTypes.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>,
                    )}
                    <div className="onboarding-checks">
                      <label>
                        <input
                          type="checkbox"
                          checked={requirements.budget}
                          onChange={(e) =>
                            setRequirements({
                              ...requirements,
                              budget: e.target.checked,
                            })
                          }
                        />
                        Under ₹40/hr
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={requirements.covered}
                          onChange={(event) =>
                            setRequirements({
                              ...requirements,
                              covered: event.target.checked,
                            })
                          }
                        />
                        Covered
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={requirements.ev}
                          onChange={(event) =>
                            setRequirements({
                              ...requirements,
                              ev: event.target.checked,
                            })
                          }
                        />
                        EV charging
                      </label>
                    </div>
                    <button className="btn dark wide" type="submit">
                      Find my spaces <ArrowRight size={17} />
                    </button>
                  </form>
                </>
              )}
            </div>
          </section>
        </div>
      )}
      {scheduleField && (
        <div
          className="overlay schedule-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setScheduleField(null);
          }}
        >
          <section
            className="schedule-popout glass"
            role="dialog"
            aria-modal="true"
            aria-label={
              scheduleField === "start"
                ? "Choose arrival time"
                : "Choose leaving time"
            }
          >
            <div className="schedule-heading">
              <span className="schedule-icon">
                {scheduleField === "start" ? (
                  <CalendarDays size={21} />
                ) : (
                  <Clock size={21} />
                )}
              </span>
              <div>
                <span className="eyebrow">
                  {scheduleField === "start" ? "ARRIVING" : "LEAVING"}
                </span>
                <h2>
                  {scheduleField === "start"
                    ? "When will you arrive?"
                    : "When will you leave?"}
                </h2>
              </div>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setScheduleField(null)}
                aria-label="Close schedule"
              >
                <X size={20} />
              </button>
            </div>
            <div className="schedule-inputs">
              <label>
                <span>Date</span>
                <input
                  type="date"
                  min={
                    scheduleField === "end"
                      ? start.slice(0, 10)
                      : localDate(new Date()).slice(0, 10)
                  }
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                />
              </label>
              <label>
                <span>Time</span>
                <input
                  type="time"
                  step="900"
                  value={draftTime}
                  onChange={(e) => setDraftTime(e.target.value)}
                />
              </label>
            </div>
            {error && <p className="schedule-error">{error}</p>}
            <div className="schedule-confirm">
              <span>
                {draftDate && draftTime
                  ? scheduleLabel(`${draftDate}T${draftTime}`)
                  : "Choose a date and time"}
              </span>
              <button
                className="btn dark"
                type="button"
                onClick={applySchedule}
                disabled={!draftDate || !draftTime}
              >
                Confirm <ArrowRight size={17} />
              </button>
            </div>
          </section>
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
                      : modal === "preferences"
                        ? "Parking preferences"
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
            {modal === "preferences" && (
              <>
                <span className="eyebrow">MAKE PARKING FIT</span>
                <h2>What do you need today?</h2>
                <p>We’ll use these preferences to show compatible spaces.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setModal("");
                  }}
                >
                  {field(
                    "Vehicle type",
                    <select
                      value={vehicle}
                      onChange={(e) => setVehicle(e.target.value)}
                    >
                      {vehicleTypes.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>,
                  )}
                  <div className="checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={requirements.covered}
                        onChange={(e) =>
                          setRequirements({
                            ...requirements,
                            covered: e.target.checked,
                          })
                        }
                      />
                      Covered parking
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={requirements.ev}
                        onChange={(e) =>
                          setRequirements({
                            ...requirements,
                            ev: e.target.checked,
                          })
                        }
                      />
                      EV charging
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={requirements.budget}
                        onChange={(e) =>
                          setRequirements({
                            ...requirements,
                            budget: e.target.checked,
                          })
                        }
                      />
                      Under ₹40 per hour
                    </label>
                  </div>
                  <button className="btn dark wide" type="submit">
                    Find my spaces <ArrowRight size={17} />
                  </button>
                </form>
              </>
            )}
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
                  Directions
                  <ArrowUpRight size={16} />
                </a>
                <div className="reservation-summary">
                  <span>
                    {dateLabel(start)} → {dateLabel(end)}
                  </span>
                  <strong>
                    {money(pricing(selected).total)}{" "}
                    <small>total · {pricing(selected).label}</small>
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
                  Directions
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
                <button
                  className="btn outline wide"
                  type="button"
                  onClick={() => sharePassPdf(pass)}
                >
                  <Share2 size={17} />
                  Share PDF pass
                </button>
                <p className="fine">
                  Your PDF pass can be sent through WhatsApp or email, saved to
                  Drive, or downloaded from the share sheet. Online verification
                  is required at the gate.
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
                      await api(
                        editingSpace
                          ? "/host/spaces/" + editingSpace
                          : "/spaces",
                        listing,
                        editingSpace ? "PATCH" : "POST",
                      );
                      await refresh();
                      close();
                      setToast("Your space has been submitted for review");
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
                        ? "Scanning this plot on your device…"
                        : aiReady
                          ? "Plot scan complete"
                          : "Scan this plot with local AI"}
                    </strong>
                    <span>
                      A private on-device check for the space you are adding.
                    </span>
                  </label>
                  {aiStatus && (
                    <p className="ai-note">
                      <Sparkles size={17} />
                      {aiStatus}
                    </p>
                  )}
                  <p className="fine">
                    This is the only AI step in Parkly. MobileViT runs locally
                    on the phone using CPU/WASM and suggests environmental cues
                    while you confirm dimensions, access and vehicle fit. The
                    photo stays on the device and is not saved to the listing.
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
                  <div className="form-row">
                    {field(
                      "Daily rate (₹)",
                      <input
                        required
                        type="number"
                        min={listing.price}
                        max={listing.price * 24}
                        value={listing.daily_rate}
                        onChange={(e) =>
                          setListing({
                            ...listing,
                            daily_rate: +e.target.value,
                          })
                        }
                      />,
                    )}
                    {field(
                      "Monthly rate (₹)",
                      <input
                        required
                        type="number"
                        min={listing.daily_rate}
                        max="1000000"
                        value={listing.monthly_rate}
                        onChange={(e) =>
                          setListing({
                            ...listing,
                            monthly_rate: +e.target.value,
                          })
                        }
                      />,
                    )}
                  </div>
                  <p className="fine">
                    Daily pricing applies through 10 days. Longer stays use your
                    monthly rate, charged in full 30-day periods.
                  </p>
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
                    Approved listings are continuously available until you pause
                    them. Payments and payouts are not enabled.
                  </p>
                  <button className="btn dark wide" disabled={busy || !aiReady}>
                    Submit for review
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
