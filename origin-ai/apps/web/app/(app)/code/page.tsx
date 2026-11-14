import { Code2 } from "lucide-react";
import { PlannedModule } from "@/components/planned";

export default function CodePage() {
  return (
    <PlannedModule icon={<Code2 className="size-5" />} title="Code" phase={6}
      summary="A browser development workspace with isolated execution."
      planned={[
        "Editor, file explorer and project management",
        "Terminal and code execution in sandboxed containers",
        "Git integration, build and test workflows",
        "Live website preview and deployment",
      ]} />
  );
}
