"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Collaborator } from "@/lib/types";
import ThemeToggle from "./ThemeToggle";

interface Props {
  title: string;
  subtitle: string;
  saveStatus: "saved" | "saving" | "offline";
  readOnly?: boolean;
  me: Collaborator | null;
  peers: Collaborator[];
  connected: boolean;
  viewMode: "standard" | "detailed";
  zoom: number;
  showLeft: boolean;
  showRight: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  /** false = scroll pans the canvas (trackpad default); true = scroll zooms. */
  zoomOnScroll: boolean;
  onToggleZoomOnScroll: () => void;

  onRename: (title: string, subtitle: string) => void;
  onEditName: () => void;
  onViewMode: (m: "standard" | "detailed") => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;

  onAI: () => void;
  onShare: () => void;
  shareCopied: boolean;
  onExportPNG: () => void;
  onExportSVG: () => void;
  onExportJSON: () => void;
  onImport: () => void;
  onHistory: () => void;
  onHandover: () => void;
  onShortcuts: () => void;
  onReset: () => void;
  onOpenCommandPalette?: () => void;
}

/** Dropdown that closes on outside click and on Escape. */
function Menu({
  label,
  children,
  align = "right",
  icon,
  title,
}: {
  label?: string;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  icon?: React.ReactNode;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        data-selected={open}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title ?? label}
        className={`ui-btn h-7.5 ${label ? "px-2.5" : "w-7.5"} text-[12px] font-medium border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700`}
      >
        {icon}
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full mt-1.5 min-w-[190px] rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-800/95 shadow-2xl backdrop-blur-md p-1.5 z-[300] animate-in fade-in zoom-in-95 duration-100"
          style={{
            [align]: 0,
          } as React.CSSProperties}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  children,
  danger,
  hint,
  icon,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  hint?: string;
  icon?: string;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`ui-btn w-full h-8 px-2.5 justify-between text-[12px] rounded-lg ${
        danger ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="text-xs">{icon}</span>}
        <span>{children}</span>
      </div>
      {hint && (
        <span className="text-[10.5px] tabular-nums font-mono text-zinc-400">
          {hint}
        </span>
      )}
    </button>
  );
}

function MenuSep() {
  return <div className="h-px my-1 mx-1 bg-zinc-200 dark:bg-zinc-700/70" />;
}

export default function TopBar(p: Props) {
  const [editing, setEditing] = useState(false);
  const [t, setT] = useState(p.title);
  const [s, setS] = useState(p.subtitle);

  useEffect(() => {
    setT(p.title);
  }, [p.title]);
  useEffect(() => {
    setS(p.subtitle);
  }, [p.subtitle]);

  const commitTitle = () => {
    setEditing(false);
    const cleanT = t.trim() || "Untitled Flowchart";
    const cleanS = s.trim();
    if (cleanT !== p.title || cleanS !== p.subtitle) {
      p.onRename(cleanT, cleanS);
    }
  };

  const zoomPercent = Math.round(p.zoom * 100);

  return (
    <header
      className="ui-panel h-13 shrink-0 flex items-center justify-between px-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md z-30 select-none"
    >
      {/* Left: Brand + Breadcrumb + Inline Rename */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <Link
          href="/"
          title="Back to all flowcharts"
          className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 font-bold text-sm transition-colors shrink-0 shadow-xs"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </Link>

        <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 shrink-0" />

        {editing && !p.readOnly ? (
          <div className="flex items-center gap-2 min-w-0 max-w-md">
            <input
              autoFocus
              value={t}
              onChange={(e) => setT(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") {
                  setT(p.title);
                  setS(p.subtitle);
                  setEditing(false);
                }
              }}
              className="ui-field !text-[13px] !font-semibold !py-1 !px-2 max-w-[220px]"
              placeholder="Flowchart Title"
            />
            <input
              value={s}
              onChange={(e) => setS(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") setEditing(false);
              }}
              className="ui-field !text-[11px] !py-1 !px-2 max-w-[200px]"
              placeholder="Description / Subtitle"
            />
          </div>
        ) : (
          <div
            onClick={() => !p.readOnly && setEditing(true)}
            title={p.readOnly ? p.title : "Click to rename this flowchart"}
            className={`min-w-0 cursor-${p.readOnly ? "default" : "pointer"} group/title flex flex-col justify-center px-1.5 py-0.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-100 truncate tracking-tight">
                {p.title}
              </span>
              {!p.readOnly && (
                <svg
                  className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                </svg>
              )}
            </div>
            {p.subtitle && (
              <span className="text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate -mt-0.5 max-w-sm">
                {p.subtitle}
              </span>
            )}
          </div>
        )}

        {/* Live sync pill badge */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium shrink-0 ml-1 ${
            p.saveStatus === "saving"
              ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
              : p.saveStatus === "offline"
              ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
              : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
          }`}
          title={
            p.saveStatus === "saving"
              ? "Saving changes to cloud…"
              : p.saveStatus === "offline"
              ? "Offline / cached locally"
              : "All changes synced to cloud in real time"
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              p.saveStatus === "saving"
                ? "bg-amber-500 animate-ping"
                : p.saveStatus === "offline"
                ? "bg-zinc-400"
                : "bg-emerald-500 animate-pulse-live"
            }`}
          />
          <span className="capitalize">{p.saveStatus}</span>
        </div>
      </div>

      {/* Center: Command Palette / Search Quick Trigger */}
      {p.onOpenCommandPalette && (
        <button
          type="button"
          onClick={p.onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 text-xs transition-colors border border-zinc-200 dark:border-zinc-700/60 shadow-2xs"
          title="Search commands and steps (Ctrl+K / Cmd+K)"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-[11.5px]">Search / Commands</span>
          <kbd className="text-[9.5px] font-mono border border-zinc-300 dark:border-zinc-600 px-1 py-0.2 rounded bg-white dark:bg-zinc-900 text-zinc-400">
            ⌘K
          </kbd>
        </button>
      )}

      {/* Right: Actions, Zoom, Collaborators, Menus */}
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        {/* Collaborators presence */}
        {p.peers.length > 0 && (
          <div className="flex items-center -space-x-1.5 mr-2">
            {p.peers.slice(0, 4).map((peer, i) => (
              <div
                key={peer.userId || i}
                title={`Collaborator: ${peer.name}`}
                className="w-6 h-6 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[9px] font-bold text-white shadow-xs"
                style={{ backgroundColor: peer.color || "#3b82f6" }}
              >
                {peer.name[0]?.toUpperCase()}
              </div>
            ))}
            {p.peers.length > 4 && (
              <div className="w-6 h-6 rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-500 text-[9px] font-bold text-white flex items-center justify-center">
                +{p.peers.length - 4}
              </div>
            )}
          </div>
        )}

        {/* View Mode Toggle */}
        <button
          type="button"
          onClick={() => p.onViewMode(p.viewMode === "detailed" ? "standard" : "detailed")}
          title={p.viewMode === "detailed" ? "Switch to standard compact view" : "Switch to detailed procedures view"}
          className={`ui-btn h-7.5 px-2 text-[11.5px] border border-zinc-200 dark:border-zinc-700/80 ${
            p.viewMode === "detailed" ? "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40" : ""
          }`}
        >
          <span className="text-xs">{p.viewMode === "detailed" ? "📋" : "▫️"}</span>
          <span className="hidden sm:inline">{p.viewMode === "detailed" ? "Detailed" : "Compact"}</span>
        </button>

        {/* Zoom Controls with percentage */}
        <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50 dark:bg-zinc-800/60 p-0.5">
          <button
            type="button"
            onClick={p.onZoomOut}
            title="Zoom out (Ctrl + -)"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs"
          >
            -
          </button>
          <button
            type="button"
            onClick={p.onZoomReset}
            title="Reset zoom (Ctrl + 0)"
            className="px-1.5 text-[11px] font-mono font-medium text-zinc-700 dark:text-zinc-300 hover:text-sky-500"
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            onClick={p.onZoomIn}
            title="Zoom in (Ctrl + =)"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs"
          >
            +
          </button>
          <button
            type="button"
            onClick={p.onFit}
            title="Fit diagram to screen (Shift + 1)"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 text-[10px]"
          >
            ⊡
          </button>
        </div>

        {/* AI Generator / Editor Button */}
        {!p.readOnly && (
          <button
            type="button"
            onClick={p.onAI}
            className="flex items-center gap-1.5 h-7.5 px-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-[11.5px] font-semibold rounded-lg shadow-sm transition-all active:scale-95"
            title="Generate or edit flowchart with AI"
          >
            <span>✨</span>
            <span className="hidden sm:inline">AI Assist</span>
          </button>
        )}

        {/* Share Button */}
        <button
          type="button"
          onClick={p.onShare}
          className={`ui-btn h-7.5 px-2.5 text-[11.5px] border ${
            p.shareCopied
              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 border-emerald-300 dark:border-emerald-800"
              : "border-zinc-200 dark:border-zinc-700"
          }`}
          title="Copy link to collaborate in real time"
        >
          <span>{p.shareCopied ? "✓" : "🔗"}</span>
          <span className="hidden sm:inline">{p.shareCopied ? "Copied Link" : "Share"}</span>
        </button>

        {/* Document Menu (Export, History, Handover, Reset) */}
        <Menu
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
            </svg>
          }
          title="More actions"
        >
          {(close) => (
            <>
              <MenuItem
                icon="🖼"
                onClick={() => {
                  close();
                  p.onExportPNG();
                }}
              >
                Export High-Res PNG
              </MenuItem>
              <MenuItem
                icon="📐"
                onClick={() => {
                  close();
                  p.onExportSVG();
                }}
              >
                Export Vector SVG
              </MenuItem>
              <MenuItem
                icon="💾"
                onClick={() => {
                  close();
                  p.onExportJSON();
                }}
                hint="⌘S"
              >
                Export JSON Backup
              </MenuItem>
              {!p.readOnly && (
                <MenuItem
                  icon="📂"
                  onClick={() => {
                    close();
                    p.onImport();
                  }}
                >
                  Import JSON Diagram
                </MenuItem>
              )}
              <MenuSep />
              <MenuItem
                icon="🕒"
                onClick={() => {
                  close();
                  p.onHistory();
                }}
              >
                Version History
              </MenuItem>
              {!p.readOnly && (
                <MenuItem
                  icon="📋"
                  onClick={() => {
                    close();
                    p.onHandover();
                  }}
                >
                  Process Handover Form
                </MenuItem>
              )}
              <MenuItem
                icon="⌨️"
                onClick={() => {
                  close();
                  p.onShortcuts();
                }}
                hint="?"
              >
                Keyboard Shortcuts
              </MenuItem>
              {!p.readOnly && (
                <>
                  <MenuSep />
                  <MenuItem
                    icon="↺"
                    danger
                    onClick={() => {
                      close();
                      p.onReset();
                    }}
                  >
                    Reset to Default Template
                  </MenuItem>
                </>
              )}
            </>
          )}
        </Menu>

        {/* Theme Toggle */}
        <ThemeToggle className="!w-7.5 !h-7.5" />

        {/* Toggle Left / Right Rails */}
        <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={p.onToggleLeft}
            data-active={p.showLeft}
            title="Toggle layers & steps panel"
            className={`ui-btn w-7.5 h-7.5 text-xs ${p.showLeft ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : ""}`}
          >
            ◧
          </button>
          <button
            type="button"
            onClick={p.onToggleRight}
            data-active={p.showRight}
            title="Toggle properties inspector panel"
            className={`ui-btn w-7.5 h-7.5 text-xs ${p.showRight ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100" : ""}`}
          >
            ◨
          </button>
        </div>
      </div>
    </header>
  );
}
