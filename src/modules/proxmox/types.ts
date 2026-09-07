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
}
