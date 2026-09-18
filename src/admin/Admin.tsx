import { useEffect, useState } from "react";
import { api } from "../shared/api";
export function Admin() {
  const [listings, setListings] = useState<any[]>([]),
    [users, setUsers] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [l, u] = await Promise.all([
        api("/admin/listings"),
        api("/admin/users"),
      ]);
      setListings(l);
      setUsers(u);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function update(path: string, status: string) {
    setBusy(true);
    setError("");
    try {
      await api(path, { status }, "PATCH");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <section className="page-intro compact">
        <div>
          <span className="eyebrow">PARKLY / OPERATIONS</span>
          <h1>Review the spaces.</h1>
          <p>Approve listings before drivers can reserve them.</p>
        </div>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <h2>Listings</h2>
      <div className="admin-grid">
        {listings.map((s) => (
          <article className="glass admin-card" key={s.id}>
            <span className="badge">{s.status.replaceAll("_", " ")}</span>
            <h3>{s.name}</h3>
            <p>
              {s.address} · {s.capacity} spaces · {s.vehicle}
            </p>
            <p>
              ₹{s.price}/hr · ₹{s.daily_rate}/day · ₹{s.monthly_rate}/month
            </p>
            <p>{s.instructions}</p>
            <div className="admin-actions">
              {["active", "rejected", "paused"].map((status) => (
                <button
                  className="btn outline small"
                  disabled={busy || s.status === status}
                  key={status}
                  onClick={() => update("/admin/listings/" + s.id, status)}
                >
                  {status === "active"
                    ? "Approve"
                    : status === "rejected"
                      ? "Reject"
                      : "Pause"}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      <h2>Accounts</h2>
      {users.map((u) => (
        <article className="glass admin-card" key={u.id}>
          <strong>{u.name}</strong>
          <p>
            {u.email} · {u.status}
          </p>
          <button
            className="btn outline small"
            disabled={busy}
            onClick={() =>
              update(
                "/admin/users/" + u.id,
                u.status === "active" ? "suspended" : "active",
              )
            }
          >
            {u.status === "active" ? "Suspend" : "Reactivate"}
          </button>
        </article>
      ))}
    </main>
  );
}
