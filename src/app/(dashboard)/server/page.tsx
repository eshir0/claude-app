import ServerWidget from "@/modules/proxmox/components/ServerWidget";

export default function ServerPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">서버</h1>
      <ServerWidget />
    </div>
  );
}
