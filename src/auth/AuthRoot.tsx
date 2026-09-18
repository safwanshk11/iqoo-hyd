import { NavigationBar } from "../shared/NavigationBar";
import { useEffect, useState } from "react";
import { ArrowRight, Car, House, LogOut } from "lucide-react";
import { api } from "../shared/api";
import App from "../App";
import { Admin } from "../admin/Admin";
export type User = {
  id: string;
  name: string;
  email: string;
  status: string;
  roles: string[];
};
export function AuthRoot() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"driver" | "host" | "admin">("driver");
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState("driver");
  function accept(u: User, preferred?: string) {
    setUser(u);
    setPassword("");
    const requested = location.pathname.startsWith("/host")
      ? "host"
      : location.pathname.startsWith("/admin")
        ? "admin"
        : location.pathname.startsWith("/app")
          ? "driver"
          : undefined;
    const saved =
      preferred ||
      requested ||
      localStorage.getItem("parkly-mode-" + u.id) ||
      "driver";
    const next = u.roles.includes(saved) ? (saved as typeof mode) : "driver";
    setMode(next);
    if (!requested || requested !== next)
      history.replaceState(
        {},
        "",
        (next === "host"
          ? "/host/dashboard"
          : next === "admin"
            ? "/admin/listings"
            : "/app/search") + location.search,
      );
  }
  useEffect(() => {
    api("/me")
      .then((r) => accept(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    const expired = () => {
      setUser(null);
      setError("Your session ended. Sign in again.");
    };
    window.addEventListener("parkly-session-expired", expired);
    return () => window.removeEventListener("parkly-session-expired", expired);
  }, []);
  async function switchMode(next: typeof mode) {
    setError("");
    setBusy(true);
    try {
      if (next === "host" && !user?.roles.includes("host")) {
        const r = await api("/auth/host", {});
        setUser(r.user);
      }
      setMode(next);
      localStorage.setItem("parkly-mode-" + user!.id, next);
      history.replaceState(
        {},
        "",
        next === "driver"
          ? "/app/search"
          : next === "host"
            ? "/host/dashboard"
            : "/admin/listings",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("/auth/logout", {});
      setUser(null);
      setMode("driver");
      history.replaceState({}, "", "/login");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="account-screen">
        <p role="status">Opening Parkly…</p>
      </main>
    );
  if (!user)
    return (
      <main className="account-screen">
        <section className="account-card glass">
          <div className="eyebrow">PARKLY / YOUR ACCOUNT</div>
          <h1>{register ? "Make room for your plans." : "Good to see you."}</h1>
          <p>
            {register
              ? "One account to find parking and share your space."
              : "Sign in to your parking, passes and spaces."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await api(
                  register ? "/auth/register" : "/auth/login",
                  { name, email, password, role },
                );
                accept(r.user, register ? role : undefined);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {register && (
              <label className="field">
                <span>Your name</span>
                <input
                  autoComplete="name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Password{register ? " · at least 12 characters" : ""}</span>
              <input
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? 12 : 1}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {register && (
              <fieldset className="account-role">
                <legend>Start with</legend>
                {[
                  ["driver", "Find parking", Car],
                  ["host", "Host a space", House],
                ].map(([value, label, Icon]: any) => (
                  <label
                    key={value}
                    className={role === value ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={value}
                      checked={role === value}
                      onChange={() => setRole(value)}
                    />
                    <Icon size={18} />
                    {label}
                  </label>
                ))}
              </fieldset>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn dark wide" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          <button
            className="text-btn account-toggle"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already have an account? Sign in"
              : "New to Parkly? Create an account"}
          </button>
        </section>
      </main>
    );
  const account = (
    <div className="account-bar">
      <div className="account-identity">
        <strong>{user.name}</strong>
        <span>{user.email}</span>
      </div>
      <label>
        <span className="sr-only">Account mode</span>
        <select
          aria-label="Account mode"
          value={mode}
          disabled={busy}
          onChange={(e) => switchMode(e.target.value as typeof mode)}
        >
          <option value="driver">Driver</option>
          <option value="host">
            {user.roles.includes("host") ? "Host" : "Become a host"}
          </option>
          {user.roles.includes("admin") && <option value="admin">Admin</option>}
        </select>
      </label>
      <button onClick={logout} disabled={busy} aria-label="Sign out">
        <LogOut size={18} />
        <span>Sign out</span>
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
  return (
    <>
      {mode === "admin" ? (
        <>
          <NavigationBar
            mode="admin"
            active="admin"
            onNavigate={() => window.scrollTo(0, 0)}
            account={account}
          />
          <Admin />
        </>
      ) : (
        <App
          key={user.id + mode}
          user={user}
          mode={mode}
          accountControls={account}
        />
      )}
    </>
  );
}
