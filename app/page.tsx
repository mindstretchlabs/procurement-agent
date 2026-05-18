import { UploadForm } from "@/components/upload-form";

export default function HomePage() {
  return (
    <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-start">
      <section>
        <p className="text-xs uppercase tracking-widest text-accent">MVP — Module 1</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
          From permit set to import sourcing analysis.
        </h1>
        <p className="mt-4 max-w-prose text-base leading-relaxed text-ink/70">
          Upload a construction permit set. We extract every window, door, and flooring schedule
          item, score it for overseas sourcing fit, and return a decision-ready executive memo.
        </p>

        <ul className="mt-8 space-y-3 text-sm text-ink/80">
          {[
            "Schedule extraction with quantities, dimensions, specs, certifications",
            "0–100 import suitability score per item with reasoning",
            "Plausible landed-cost savings range vs domestic supply",
            "Executive procurement summary with key risks and next steps",
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-accent" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <UploadForm />
    </div>
  );
}
