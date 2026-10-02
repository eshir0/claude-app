// Pure helpers for QEMU guest-agent disk usage — no server-only, so they're
// unit testable. service.ts does the actual API calls.
//
// Proxmox's VM list reports `disk: 0` for every QEMU VM: the hypervisor
// can't see inside a virtual disk's filesystem. The QEMU guest agent can
// (GET /nodes/{node}/qemu/{vmid}/agent/get-fsinfo, which needs the
// VM.GuestAgent.Audit privilege on the VM), so that's where real usage for
// a running VM comes from.

/** Filesystems that aren't the VM's own disk space: read-only images (snap
 * packages, mounted ISOs), memory-backed and overlay mounts, network shares. */
const EXCLUDED_FS_TYPES = new Set([
  "squashfs",
  "iso9660",
  "udf",
  "overlay",
  "tmpfs",
  "devtmpfs",
  "ramfs",
  "nfs",
  "nfs4",
  "cifs",
  "smb3",
  "fuse.sshfs",
]);

function asNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Sums used/total bytes over the guest's real filesystems from a
 * get-fsinfo `result` array, or null if none can be counted. Each block
 * device (`name`, e.g. "sda1", "dm-0", a Windows volume GUID) is counted
 * once — the same filesystem mounted at several places (bind mounts, btrfs
 * subvolumes) must not be added up twice.
 */
export function summarizeGuestFsInfo(result: unknown): { used: number; total: number } | null {
  if (!Array.isArray(result)) return null;
  const seen = new Set<string>();
  let used = 0;
  let total = 0;
  let counted = 0;
  for (const fs of result) {
    if (!fs || typeof fs !== "object") continue;
    const entry = fs as Record<string, unknown>;
    const type = typeof entry.type === "string" ? entry.type.toLowerCase() : "";
    if (EXCLUDED_FS_TYPES.has(type)) continue;
    const fsTotal = asNonNegativeNumber(entry["total-bytes"]);
    const fsUsed = asNonNegativeNumber(entry["used-bytes"]);
    if (fsTotal === null || fsTotal === 0 || fsUsed === null) continue;
    const name = typeof entry.name === "string" && entry.name ? entry.name : `${type}:${String(entry.mountpoint)}`;
    if (seen.has(name)) continue;
    seen.add(name);
    used += fsUsed;
    total += fsTotal;
    counted++;
  }
  return counted > 0 ? { used, total } : null;
}

export type GuestDiskUnavailableReason = "stopped" | "no-agent" | "no-permission";

/** Why get-fsinfo failed, from the error proxmoxRequest threw. */
export function classifyGuestAgentError(err: unknown): Exclude<GuestDiskUnavailableReason, "stopped"> {
  const message = err instanceof Error ? err.message : String(err);
  return /Proxmox API HTTP 403\b/.test(message) ? "no-permission" : "no-agent";
}
