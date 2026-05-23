"use client";

import { useEffect, useState } from "react";

type AnalysisStatus =
  | "pending"
  | "extracting"
  | "scoring"
  | "summarizing"
  | "translating"
  | "complete"
  | "failed";

type MaterialItem = {
  id: string;
  category: "doors" | "flooring";
  mark: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  specs: Record<string, unknown> | null;
  dimensions: { width?: string | null; height?: string | null; raw?: string | null } | null;
  certifications: string[] | null;
  import_suitability_score: number | null;
  import_suitability_reasoning: string | null;
  estimated_savings_low_pct: number | null;
  estimated_savings_high_pct: number | null;
  risk_notes: string | null;
};

type SourcingBriefItem = {
  category_zh: string;
  mark: string | null;
  description_zh: string;
  quantity: number | null;
  unit_zh: string | null;
  dimensions_zh: string | null;
  specs_zh: string;
  certifications_zh: string;
};

type SourcingBrief = {
  project_title_zh: string;
  intro_zh: string;
  items_zh: SourcingBriefItem[];
  notes_zh: string | null;
};

type AnalysisResponse = {
  id: string;
  status: AnalysisStatus;
  fileName: string | null;
  categories: string[];
  createdAt: string;
  completedAt?: string;
  errorMessage?: string | null;
  items?: MaterialItem[];
  summary?: {
    executive_summary: string;
    total_items: number;
    total_estimated_savings_low_pct: number | null;
    total_estimated_savings_high_pct: number | null;
    key_risks: string[];
    recommended_next_steps: string[];
  } | null;
  sourcingBrief?: SourcingBrief | null;
};

const STAGE_LABELS: Record<AnalysisStatus, string> = {
  pending: "Queued",
  extracting: "Extracting schedules from the PDF",
  scoring: "Scoring import suitability",
  summarizing: "Drafting executive summary",
  translating: "Generating Chinese sourcing brief",
  complete: "Complete",
  failed: "Failed",
};

const STAGES: AnalysisStatus[] = [
  "pending",
  "extracting",
  "scoring",
  "summarizing",
  "translating",
  "complete",
];

type Tab = "summary" | "items" | "sourcing-brief";

export function AnalysisReport({ analysisId }: { analysisId: string }) {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("summary");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const response = await fetch(`/api/analyses/${analysisId}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const json = (await response.json()) as AnalysisResponse;
        if (cancelled) return;
        setData(json);
        if (json.status !== "complete" && json.status !== "failed") {
          timer = setTimeout(poll, 3000);
        }
      } catch (err) {
        if (!cancelled) {
          setPollError(err instanceof Error ? err.message : String(err));
          timer = setTimeout(poll, 5000);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [analysisId]);

  if (!data) {
    return (
      <p className="text-sm text-ink/60">
        Loading analysis…{pollError ? ` (${pollError})` : ""}
      </p>
    );
  }

  if (data.status === "failed") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-800">Analysis failed</h2>
        <p className="mt-2 text-sm text-red-700">{data.errorMessage ?? "Unknown error"}</p>
      </div>
    );
  }

  if (data.status !== "complete") {
    return <StageProgress status={data.status} fileName={data.fileName} />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "summary", label: "Executive Summary" },
    { id: "items", label: "Items" },
    { id: "sourcing-brief", label: "采购清单 Sourcing Brief" },
  ];

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 rounded-lg border border-ink/10 bg-white p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-ink text-white"
                : "text-ink/60 hover:bg-ink/5 hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "summary" && <SummaryTab data={data} />}
      {activeTab === "items" && <ItemsTab data={data} />}
      {activeTab === "sourcing-brief" && <SourcingBriefTab brief={data.sourcingBrief} />}
    </div>
  );
}

function StageProgress({
  status,
  fileName,
}: {
  status: AnalysisStatus;
  fileName: string | null;
}) {
  const currentIndex = STAGES.indexOf(status);
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-ink/50">
        {fileName ? `Working on ${fileName}` : "Working"}
      </p>
      <h2 className="mt-2 text-xl font-semibold">{STAGE_LABELS[status]}</h2>
      <ol className="mt-6 space-y-3">
        {STAGES.filter((s) => s !== "complete").map((stage, idx) => {
          const done = idx < currentIndex;
          const active = idx === currentIndex;
          return (
            <li
              key={stage}
              className={`flex items-center gap-3 text-sm ${
                done ? "text-ink/50" : active ? "text-ink" : "text-ink/30"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  done ? "bg-ink/40" : active ? "bg-accent animate-pulse" : "bg-ink/15"
                }`}
              />
              {STAGE_LABELS[stage]}
            </li>
          );
        })}
      </ol>
      <p className="mt-6 text-xs text-ink/40">
        This typically takes 1–3 minutes depending on PDF size.
      </p>
    </div>
  );
}

function SummaryTab({ data }: { data: AnalysisResponse }) {
  const summary = data.summary;
  if (!summary) return <p className="text-sm text-ink/50">No summary available.</p>;

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent">Executive Summary</p>
          <h2 className="mt-1 text-2xl font-semibold">
            {data.fileName ?? "Permit set analysis"}
          </h2>
        </div>
        <SavingsBadge
          low={summary.total_estimated_savings_low_pct}
          high={summary.total_estimated_savings_high_pct}
        />
      </div>
      <div className="prose prose-sm mt-6 max-w-none text-ink/85">
        {summary.executive_summary.split(/\n+/).map((para, idx) => (
          <p key={idx}>{para}</p>
        ))}
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <ListBlock title="Key risks" items={summary.key_risks} />
        <ListBlock title="Recommended next steps" items={summary.recommended_next_steps} />
      </div>
    </section>
  );
}

function ItemsTab({ data }: { data: AnalysisResponse }) {
  const items = data.items ?? [];
  const byCategory = items.reduce<Record<string, MaterialItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  return (
    <section>
      <h3 className="text-lg font-semibold">Items by category</h3>
      <p className="mt-1 text-sm text-ink/60">{items.length} items extracted</p>
      <div className="mt-6 space-y-8">
        {(["doors", "flooring"] as const).map((category) => {
          const list = byCategory[category];
          if (!list?.length) return null;
          return <CategoryTable key={category} category={category} items={list} />;
        })}
      </div>
    </section>
  );
}

function SourcingBriefTab({ brief }: { brief?: SourcingBrief | null }) {
  const [copied, setCopied] = useState(false);

  if (!brief || !brief.items_zh?.length) {
    return <p className="text-sm text-ink/50">No sourcing brief available.</p>;
  }

  function buildPlainText(): string {
    if (!brief) return "";
    const lines: string[] = [
      brief.project_title_zh,
      "",
      brief.intro_zh,
      "",
      "---",
      "",
    ];
    for (const item of brief.items_zh) {
      lines.push(`【${item.category_zh}】${item.mark ? ` ${item.mark}` : ""}`);
      lines.push(item.description_zh);
      if (item.quantity != null) {
        lines.push(`数量: ${item.quantity}${item.unit_zh ? ` ${item.unit_zh}` : ""}`);
      }
      if (item.dimensions_zh) lines.push(`尺寸: ${item.dimensions_zh}`);
      lines.push(`规格: ${item.specs_zh}`);
      lines.push(`认证要求: ${item.certifications_zh}`);
      lines.push("");
    }
    if (brief.notes_zh) {
      lines.push("---", "", `备注: ${brief.notes_zh}`);
    }
    return lines.join("\n");
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(buildPlainText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{brief.project_title_zh}</h3>
          <p className="mt-1 text-sm text-ink/60">{brief.intro_zh}</p>
        </div>
        <button
          onClick={handleCopy}
          className="flex-none rounded-md border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
        >
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
      </div>

      <div className="divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white shadow-sm">
        {brief.items_zh.map((item, idx) => (
          <div key={idx} className="grid gap-3 px-6 py-5 md:grid-cols-[0.4fr_1.2fr_1fr]">
            <div>
              <p className="text-sm font-semibold text-ink">
                {item.category_zh}
              </p>
              {item.mark && <p className="text-xs text-ink/50">{item.mark}</p>}
              {item.quantity != null && (
                <p className="mt-1 text-xs text-ink/60">
                  {item.quantity}{item.unit_zh ? ` ${item.unit_zh}` : ""}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-ink">{item.description_zh}</p>
              {item.dimensions_zh && (
                <p className="mt-1 text-xs text-ink/60">尺寸: {item.dimensions_zh}</p>
              )}
              <p className="mt-2 text-xs text-ink/70">{item.specs_zh}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-ink/80">认证要求</p>
              <p className="mt-1 text-xs text-ink/70">{item.certifications_zh}</p>
            </div>
          </div>
        ))}
      </div>

      {brief.notes_zh && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          备注: {brief.notes_zh}
        </p>
      )}
    </section>
  );
}

function SavingsBadge({ low, high }: { low: number | null; high: number | null }) {
  if (low == null && high == null) return null;
  const label =
    low != null && high != null && low !== high
      ? `${Math.round(low)}–${Math.round(high)}%`
      : `${Math.round((low ?? high) as number)}%`;
  return (
    <div className="rounded-xl bg-accent/10 px-4 py-3 text-right">
      <p className="text-[10px] uppercase tracking-widest text-accent">Plausible savings</p>
      <p className="text-2xl font-semibold text-accent">{label}</p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-widest text-ink/60">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm text-ink/80">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-ink/40" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryTable({
  category,
  items,
}: {
  category: "doors" | "flooring";
  items: MaterialItem[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
      <div className="flex items-baseline justify-between border-b border-ink/10 px-6 py-4">
        <h4 className="text-base font-semibold capitalize">{category}</h4>
        <span className="text-xs text-ink/50">{items.length} items</span>
      </div>
      <ul className="divide-y divide-ink/10">
        {items.map((item) => (
          <li key={item.id} className="grid gap-3 px-6 py-5 md:grid-cols-[1.5fr_1fr_0.6fr]">
            <div>
              <p className="text-sm font-medium text-ink">
                {item.mark ? `${item.mark} · ` : ""}
                {item.description}
              </p>
              <p className="mt-1 text-xs text-ink/60">
                {item.quantity != null
                  ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
                  : "—"}
                {item.dimensions?.raw ? ` · ${item.dimensions.raw}` : ""}
              </p>
              {item.certifications && item.certifications.length > 0 && (
                <p className="mt-2 text-xs text-ink/50">
                  Certs: {item.certifications.join(", ")}
                </p>
              )}
            </div>
            <div className="text-sm text-ink/75">
              {item.import_suitability_reasoning}
              {item.risk_notes && (
                <p className="mt-2 text-xs text-amber-700">⚠ {item.risk_notes}</p>
              )}
            </div>
            <div className="md:text-right">
              <ScoreChip score={item.import_suitability_score} />
              {item.estimated_savings_low_pct != null &&
                item.estimated_savings_high_pct != null && (
                  <p className="mt-1 text-xs text-ink/60">
                    {Math.round(item.estimated_savings_low_pct)}–
                    {Math.round(item.estimated_savings_high_pct)}% savings
                  </p>
                )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreChip({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-ink/40">—</span>;
  const rounded = Math.round(score);
  const tier =
    rounded >= 80
      ? "bg-emerald-100 text-emerald-800"
      : rounded >= 50
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${tier}`}>
      {rounded} / 100
    </span>
  );
}
