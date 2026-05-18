import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SourceProBuild — AI Procurement Analyst",
  description:
    "From permit set to factory quote to executive procurement decision — AI-powered global sourcing for construction materials.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-ink/10">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-semibold tracking-tight text-ink">
              SourceProBuild
            </Link>
            <span className="text-xs uppercase tracking-widest text-ink/50">
              AI Procurement Analyst
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
