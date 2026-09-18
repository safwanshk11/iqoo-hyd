import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bookmark, Menu, Ticket, X } from "lucide-react";

type Props = {
  mode: "driver" | "host" | "admin";
  active: string;
  onNavigate: (page: string) => void;
  account: ReactNode;
  mapHidden?: boolean;
};
export function NavigationBar({
  mode,
  active,
  onNavigate,
  account,
  mapHidden = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null),
    toggle = useRef<HTMLButtonElement>(null);
  const items =
    mode === "driver"
      ? [
          ["discover", "Find parking"],
          ["events", "Event parking"],
          ["saved", "Saved spaces"],
        ]
      : mode === "host"
        ? [["host", "Host dashboard"]]
        : [["admin", "Operations"]];
  useEffect(() => {
    function dismiss(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        toggle.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  function go(page: string) {
    setOpen(false);
    onNavigate(page);
  }
  const links = items.map(([page, label]) => (
    <button
      key={page}
      className={active === page ? "nav-active" : ""}
      aria-current={active === page ? "page" : undefined}
      onClick={() => go(page)}
    >
      {label}
    </button>
  ));
  return (
    <header
      ref={root}
      className={"nav-shell " + (mapHidden ? "nav-map-hidden" : "")}
    >
      <div className={"nav glass expandable-nav " + (open ? "is-open" : "")}>
        <div className="nav-main">
          <button
            className="brand"
            onClick={() =>
              go(
                mode === "driver"
                  ? "discover"
                  : mode === "host"
                    ? "host"
                    : "admin",
              )
            }
          >
            Park<span className="serif">ly</span>
            <span className="beta">HYD</span>
          </button>
          <nav className="desktop-links" aria-label="Main navigation">
            {links}
          </nav>
          <div className="nav-right">
            {mode === "driver" && (
              <>
                <button
                  className={
                    "icon-btn saved-nav " + (active === "saved" ? "active" : "")
                  }
                  onClick={() => go("saved")}
                  aria-label="Saved spaces"
                >
                  <Bookmark size={19} />
                </button>
                <button
                  className="btn dark small"
                  onClick={() => go("bookings")}
                >
                  <Ticket size={17} />
                  <span>My bookings</span>
                </button>
              </>
            )}
            <button
              ref={toggle}
              type="button"
              className="icon-btn menu"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="account-navigation"
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={23} /> : <Menu size={23} />}
            </button>
          </div>
        </div>
        <div
          id="account-navigation"
          className="nav-drawer"
          aria-hidden={!open}
          inert={!open}
        >
          <div className="nav-drawer-clip">
            <div className="nav-drawer-content">
              <nav className="drawer-links" aria-label="Mobile navigation">
                {links}
              </nav>
              {account}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
