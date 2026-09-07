import "server-only";
import { proxmoxRequest } from "./client";
import { isSensorsConfigured, fetchSensorReadings } from "./sensors";
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
  netin: number;
  netout: number;
}

interface RawStorage {
  storage: string;
  type: string;
  used: number;
  total: number;
  active: number; // 0 or 1
}

function mapGuest(g: RawGuest, type: "qemu" | "lxc"): ProxmoxGuestStatus {
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
    netInBytes: g.netin ?? 0,
    netOutBytes: g.netout ?? 0,
  };
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

    const [qemu, lxc, storage] = await Promise.all([
      proxmoxRequest<RawGuest[]>(`/nodes/${n.node}/qemu`),
      proxmoxRequest<RawGuest[]>(`/nodes/${n.node}/lxc`),
      proxmoxRequest<RawStorage[]>(`/nodes/${n.node}/storage`),
    ]);
    guests.push(...qemu.map((g) => mapGuest(g, "qemu")));
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

  return { nodes, guests, storages: [...storageByName.values()], sensors };
}
