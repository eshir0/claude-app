import LottoWidget from "@/modules/lotto/components/LottoWidget";

export default function LottoPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">로또 번호 생성</h1>
      <LottoWidget />
    </div>
  );
}
