import { Bot } from "lucide-react";
import { PlannedModule } from "@/components/planned";

export default function AgentsPage() {
  return (
    <PlannedModule icon={<Bot className="size-5" />} title="Agents" phase={4}
      summary="Autonomous, permission-controlled task execution inside the chat."
      planned={[
        "Tool framework with typed, permission-scoped tools",
        "Plan → act → verify execution loop with error recovery",
        "Approval requests for sensitive or destructive actions",
        "Coding, research, website, document, data and automation agents",
        "Depends on a far more capable Origin model than the current bootstrap checkpoint",
      ]} />
  );
}
