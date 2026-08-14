"use client";

import { useState } from "react";
import { setUserName } from "@/lib/user";
import { Collaborator } from "@/lib/types";

interface Props {
  onDone: (user: Collaborator) => void;
  initial?: string;
  title?: string;
}

export default function NamePrompt({ onDone, initial = "", title = "Welcome" }: Props) {
  const [name, setName] = useState(initial);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onDone(setUserName(name));
  };

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-6"
      >
        <div className="w-12 h-12 rounded-xl bg-emerald-700 flex items-center justify-center text-white text-2xl font-bold mb-4 shadow-md">
          R
        </div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-4">
          Enter your name so teammates can see who&apos;s editing. No password needed — anyone with the
          link can collaborate live.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Youssef R."
          maxLength={40}
          className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="mt-4 w-full px-4 py-2.5 text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors shadow-sm"
        >
          Start collaborating
        </button>
      </form>
    </div>
  );
}
