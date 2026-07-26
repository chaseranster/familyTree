"use client";

import { useState, type ReactNode } from "react";

export function TreeViewTabs({ chart, list }: { chart: ReactNode; list: ReactNode }) {
  const [tab, setTab] = useState<"chart" | "list">("chart");

  const tabClass = (active: boolean) =>
    `min-h-9 flex-1 rounded px-3 py-1.5 text-sm font-medium ${
      active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
    }`;

  return (
    <div>
      <div className="mb-3 inline-flex w-full max-w-xs rounded-md border border-gray-200 bg-gray-50 p-1">
        <button type="button" onClick={() => setTab("chart")} className={tabClass(tab === "chart")}>
          Chart
        </button>
        <button type="button" onClick={() => setTab("list")} className={tabClass(tab === "list")}>
          List
        </button>
      </div>
      <div className={tab === "chart" ? "block" : "hidden"}>{chart}</div>
      <div className={tab === "list" ? "block" : "hidden"}>{list}</div>
    </div>
  );
}
