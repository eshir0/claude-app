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
  /** LXC containers report real disk usage. QEMU VMs typically report 0
   * here (the hypervisor can't see inside a virtual disk's filesystem
   * without a guest agent) even though diskTotal is a real provisioned
   * size — shown as-is rather than hidden, so a "VM 0GB used" isn't
   * mistaken for a bug. */
  diskUsed: number;
  diskTotal: number;
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
