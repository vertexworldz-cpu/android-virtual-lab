import { Search } from "lucide-react";
import { PlannedModule } from "@/components/planned";

export default function ResearchPage() {
  return (
    <PlannedModule icon={<Search className="size-5" />} title="Research" phase={6}
      summary="A workspace for sources, analysis and reports."
      planned={[
        "Source management and document indexing",
        "Retrieval over your files (pgvector)",
        "Knowledge extraction and report generation",
        "Research history",
      ]} />
  );
}
