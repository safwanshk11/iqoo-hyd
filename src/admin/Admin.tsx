import { useEffect, useState } from "react";
import { api } from "../shared/api";
export function Admin() {
  const [listings, setListings] = useState<any[]>([]),
    [users, setUsers] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState<any>(null),
    [confirmation, setConfirmation] = useState("");
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
  async function deleteAccount() {
    setBusy(true);
    setError("");
    try {
      await api("/admin/users/" + deleting.id, { email: confirmation }, "DELETE");
      setDeleting(null);
      setConfirmation("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
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
          <button className="btn outline small" disabled={busy || !u.can_delete}
            title={!u.can_delete ? "Administrator accounts are protected" : undefined}
            onClick={() => { setDeleting(u); setConfirmation(""); setError(""); }}>
            Delete account
          </button>
          {deleting?.id === u.id && (
            <section aria-label="Confirm account deletion" className="admin-delete-confirm">
              <h3>Delete {u.name}'s account?</h3>
              <p>This permanently removes their login and profile, signs them out, and pauses their listings. Booking history is retained. Accounts with upcoming bookings or events cannot be deleted.</p>
              <label>Type {u.email} to confirm
                <input type="email" value={confirmation} disabled={busy}
                  onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" />
              </label>
              <div className="admin-actions">
                <button className="btn outline small" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>
                <button className="btn dark small" disabled={busy || confirmation !== u.email} onClick={deleteAccount}>
                  {busy ? "Deleting…" : "Permanently delete account"}
                </button>
              </div>
            </section>
          )}
        </article>
      ))}
    </main>
  );
}
