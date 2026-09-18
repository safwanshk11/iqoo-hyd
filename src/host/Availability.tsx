import { useState } from "react";
import { api } from "../shared/api";
export type Block = {
  id: string;
  space_id: string;
  start_time: string;
  end_time: string;
};
export function Availability({
  spaces,
  blocks,
  refresh,
}: {
  spaces: { id: string; name: string }[];
  blocks: Block[];
  refresh: () => Promise<void>;
}) {
  const [space, setSpace] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="glass availability-editor">
      <h2>Unavailable periods</h2>
      <p>
        Block dates when you need the space yourself. Existing reservations
        remain protected.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            api("/host/spaces/" + space + "/blocks", {
              start: new Date(start).toISOString(),
              end: new Date(end).toISOString(),
            }),
          );
        }}
      >
        <label className="field">
          <span>Location</span>
          <select
            value={space}
            onChange={(e) => setSpace(e.target.value)}
            required
          >
            <option value="">Choose a space</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label className="field">
            <span>From</span>
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Until</span>
            <input
              type="datetime-local"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <button className="btn dark" disabled={busy || !spaces.length}>
          Block dates
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {blocks.map((b) => (
        <div className="blocked-period" key={b.id}>
          <span>
            <strong>{spaces.find((s) => s.id === b.space_id)?.name}</strong>
            <br />
            {new Date(b.start_time).toLocaleString()} →{" "}
            {new Date(b.end_time).toLocaleString()}
          </span>
          <button
            className="text-btn"
            disabled={busy}
            onClick={() =>
              run(() => api("/host/blocks/" + b.id + "/remove", {}))
            }
          >
            Remove
          </button>
        </div>
      ))}
    </section>
  );
}
