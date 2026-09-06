import type { ModuleManifest } from "@/modules/types";
import CardsWidget from "./components/CardsWidget";

export const aiUsageModule: ModuleManifest = {
  id: "ai-usage",
  label: "AI 사용량",
  href: "/ai-usage",
  iconKey: "bar-chart",
  HomeWidget: CardsWidget,
};
