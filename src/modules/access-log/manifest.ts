import type { ModuleManifest } from "@/modules/types";
import AccessLogHomeWidget from "./components/AccessLogHomeWidget";

export const accessLogModule: ModuleManifest = {
  id: "access-log",
  label: "접속 기록",
  href: "/access-log",
  iconKey: "shield",
  HomeWidget: AccessLogHomeWidget,
};
