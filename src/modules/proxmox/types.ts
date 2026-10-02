import type { GuestDiskUnavailableReason } from "./guest-disk";

export interface ProxmoxNodeStatus {
  node: string;
  cpuFraction: number; // 0-1, host-wide CPU load
  cpuCount: number;
  memUsed: number;
  memTotal: number;
  diskUsed: number;
  diskTotal: number;
  uptimeSeconds: number;
}

export interface ProxmoxGuestStatus {
  vmid: number;
  name: string;
  type: "qemu" | "lxc";
  status: string; // "running" | "stopped" | ... — shown as-is, not enumerated
  cpuFraction: number; // 0-1
  cpuCount: number;
  memUsed: number;
  memTotal: number;
  uptimeSeconds: number;
  /** Meaningful only when diskSource isn't "unavailable". */
  diskUsed: number;
  /** Filesystem size for "proxmox"/"guest-agent"; the provisioned virtual
   * disk size when "unavailable". */
  diskTotal: number;
  /** Where diskUsed comes from: Proxmox itself (LXC), the QEMU guest agent
   * inside a running VM, or nowhere — Proxmox reports 0 for every QEMU VM,
   * which used to be shown as if the VM's disk were empty. */
  diskSource: "proxmox" | "guest-agent" | "unavailable";
  /** Set only when diskSource is "unavailable". */
  diskUnavailableReason: GuestDiskUnavailableReason | null;
}

/** A Datacenter-level storage pool (e.g. "local-lvm") — where VM/container
 * disks actually live, distinct from a node's own root filesystem. */
export interface ProxmoxStoragePool {
  storage: string;
  type: string;
  used: number;
  total: number;
  active: boolean;
}

export interface ProxmoxOverview {
  nodes: ProxmoxNodeStatus[];
  guests: ProxmoxGuestStatus[];
  storages: ProxmoxStoragePool[];
  /** null when PROXMOX_SSH_HOST/PROXMOX_SSH_KEY_PATH aren't configured, or
   * the SSH read failed this time — never fabricated. */
  sensors: { cpuTempC: number | null; gpuTempC: number | null; nvmeTempC: number | null } | null;
}
