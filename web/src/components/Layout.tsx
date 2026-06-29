import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="navbar">
        <div className="brand">
          <Link to="/">🛡 USCIS Tracker</Link>
        </div>
        <div className="right">
          <Link to="/settings">⚙ Settings</Link>
        </div>
      </nav>
      <div className="container">{children}</div>
    </>
  );
}
