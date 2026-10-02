import "server-only";
import { proxmoxRequest } from "./client";
import { isSensorsConfigured, fetchSensorReadings } from "./sensors";
import { summarizeGuestFsInfo, classifyGuestAgentError } from "./guest-disk";
import type { ProxmoxNodeStatus, ProxmoxGuestStatus, ProxmoxStoragePool, ProxmoxOverview } from "./types";

// Raw shapes below match fields actually observed from a live Proxmox VE
// 9.2 instance (GET /nodes, /nodes/{node}/status, /nodes/{node}/qemu,
// /nodes/{node}/lxc, /nodes/{node}/storage) — not guessed from docs. Only
// the fields this app actually uses are typed.

interface RawNodeListEntry {
  node: string;
}

interface RawNodeStatus {
  cpu: number;
  uptime: number;
  cpuinfo: { cpus: number };
  memory: { total: number; used: number };
  rootfs: { total: number; used: number };
}

interface RawGuest {
  vmid: number;
  name: string;
  status: string;
  cpu: number;
  cpus: number;
  mem: number;
  maxmem: number;
  uptime: number;
  disk: number;
  maxdisk: number;
}

interface RawStorage {
  storage: string;
  type: string;
  used: number;
  total: number;
  active: number; // 0 or 1
}

function mapGuest(g: RawGuest, type: "qemu" | "lxc"): ProxmoxGuestStatus {
  // QEMU's `disk` is always 0 from this list (see guest-disk.ts) — mark it
  // unknown here; withGuestAgentDisk() fills it in for running VMs.
  const qemu = type === "qemu";
  return {
    vmid: g.vmid,
    name: g.name,
    type,
    status: g.status,
    cpuFraction: g.cpu,
    cpuCount: g.cpus,
    memUsed: g.mem,
    memTotal: g.maxmem,
    uptimeSeconds: g.uptime,
    // A stopped guest doesn't report these — default to 0 rather than NaN.
    diskUsed: qemu ? 0 : (g.disk ?? 0),
    diskTotal: g.maxdisk ?? 0,
    diskSource: qemu ? "unavailable" : "proxmox",
    diskUnavailableReason: qemu ? (g.status === "running" ? "no-agent" : "stopped") : null,
  };
}

/**
 * Real filesystem usage for a running QEMU VM via its guest agent. Never
 * throws: an agent that isn't installed/running, or a token without
 * VM.GuestAgent.Audit, just leaves the disk marked unavailable (with why).
 */
async function withGuestAgentDisk(node: string, guest: ProxmoxGuestStatus): Promise<ProxmoxGuestStatus> {
  if (guest.type !== "qemu" || guest.status !== "running") return guest;
  try {
    const data = await proxmoxRequest<{ result?: unknown }>(`/nodes/${node}/qemu/${guest.vmid}/agent/get-fsinfo`);
    const summary = summarizeGuestFsInfo(data?.result);
    if (!summary) return guest;
    return {
      ...guest,
      diskUsed: summary.used,
      diskTotal: summary.total,
      diskSource: "guest-agent",
      diskUnavailableReason: null,
    };
  } catch (err) {
    return { ...guest, diskUnavailableReason: classifyGuestAgentError(err) };
  }
}

/**
 * Live snapshot only — this app does not persist Proxmox history (Proxmox
 * itself already keeps RRD history server-side if that's ever needed later).
 * Queries every node in the cluster (just one, in the common single-node
 * home-server case) plus every VM/LXC guest and storage pool on each.
 *
 * `diskUsed`/`diskTotal` on ProxmoxNodeStatus are the node's own root
 * filesystem (where Proxmox itself is installed) — NOT where VM/container
 * disks live. That's `storages` (Datacenter-level pools like "local-lvm"),
 * kept as a separate list since it's a genuinely different quantity, not a
 * more-detailed breakdown of the same one.
 */
export async function getProxmoxOverview(): Promise<ProxmoxOverview> {
  const nodeList = await proxmoxRequest<RawNodeListEntry[]>("/nodes");

  const nodes: ProxmoxNodeStatus[] = [];
  const guests: ProxmoxGuestStatus[] = [];
  const storageByName = new Map<string, ProxmoxStoragePool>();

  for (const n of nodeList) {
    const status = await proxmoxRequest<RawNodeStatus>(`/nodes/${n.node}/status`);
    nodes.push({
      node: n.node,
      cpuFraction: status.cpu,
      cpuCount: status.cpuinfo.cpus,
      memUsed: status.memory.used,
      memTotal: status.memory.total,
      diskUsed: status.rootfs.used,
      diskTotal: status.rootfs.total,
      uptimeSeconds: status.uptime,
    });

    // Sequential, not Promise.all — each proxmoxRequest opens a fresh TLS
    // connection by design (see client.ts's comment on why it never reuses
    // one), and pveproxy's own worker pool is small enough that firing
    // several brand-new handshakes at once measurably increased connection
    // failures in practice. A slightly slower refresh is a fine trade for
    // not competing with itself for pveproxy's limited workers.
    const qemu = await proxmoxRequest<RawGuest[]>(`/nodes/${n.node}/qemu`);
    const lxc = await proxmoxRequest<RawGuest[]>(`/nodes/${n.node}/lxc`);
    const storage = await proxmoxRequest<RawStorage[]>(`/nodes/${n.node}/storage`);
    // Sequential for the same reason as above.
    for (const g of qemu) guests.push(await withGuestAgentDisk(n.node, mapGuest(g, "qemu")));
    guests.push(...lxc.map((g) => mapGuest(g, "lxc")));
    for (const s of storage) {
      // A shared storage pool appears once per node with identical figures
      // — keep only the first sighting rather than listing it N times.
      if (!storageByName.has(s.storage)) {
        storageByName.set(s.storage, {
          storage: s.storage,
          type: s.type,
          used: s.used,
          total: s.total,
          active: s.active === 1,
        });
      }
    }
  }

  // Best-effort, independent of the Proxmox API path entirely (different
  // credentials, different transport) — a temperature-read failure must
  // never take down the rest of the overview.
  let sensors: ProxmoxOverview["sensors"] = null;
  if (isSensorsConfigured()) {
    try {
      sensors = await fetchSensorReadings();
    } catch {
      sensors = null;
    }
  }

  // Proxmox returns these lists in no fixed order (it can change between two
  // calls), which made rows jump around on every refresh — pin a stable
  // order: hosts and pools by name, guests QEMU VMs first then LXC
  // containers, each by VMID.
  const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
  const TYPE_ORDER: Record<ProxmoxGuestStatus["type"], number> = { qemu: 0, lxc: 1 };
  nodes.sort((a, b) => byName(a.node, b.node));
  guests.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.vmid - b.vmid);
  const storages = [...storageByName.values()].sort((a, b) => byName(a.storage, b.storage));

  return { nodes, guests, storages, sensors };
}
