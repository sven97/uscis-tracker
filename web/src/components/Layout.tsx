import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="masthead">
        <Link to="/" className="brand">
          <span className="seal">USA</span>
          <span className="brand-text">
            <span className="title">USCIS Case Tracker</span>
          </span>
        </Link>
        <Link to="/settings" className="nav-link">
          Settings
        </Link>
      </header>
      {children}
    </div>
  );
}
