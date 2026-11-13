import { Sparkles } from "lucide-react";
import { PlannedModule } from "@/components/planned";

export default function CreatePage() {
  return (
    <PlannedModule icon={<Sparkles className="size-5" />} title="Create" phase={6}
      summary="Image, audio and video generation with Origin's own or properly licensed models."
      planned={[
        "Pluggable generator interface for specialised models",
        "Image generation first, then audio and video",
        "Editing workflows and creative project management",
        "Requires dedicated models and GPU compute that do not exist in this installation yet",
      ]} />
  );
}
