import Link from "next/link";
import { AnalysisReport } from "@/components/analysis-report";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-8">
      <Link href="/" className="text-sm text-ink/60 hover:text-ink">
        ← New analysis
      </Link>
      <AnalysisReport analysisId={id} />
    </div>
  );
}
