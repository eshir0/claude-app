import type { ModuleManifest } from "@/modules/types";
import ServerWidget from "./components/ServerWidget";

export const proxmoxModule: ModuleManifest = {
  id: "proxmox",
  label: "서버",
  href: "/server",
  iconKey: "server",
  HomeWidget: ServerWidget,
};
