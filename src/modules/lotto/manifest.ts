import type { ModuleManifest } from "@/modules/types";
import LottoWidget from "./components/LottoWidget";

export const lottoModule: ModuleManifest = {
  id: "lotto",
  label: "로또 번호 생성",
  href: "/lotto",
  iconKey: "dice",
  HomeWidget: LottoWidget,
};
