import "server-only";
import { spawn } from "node:child_process";

// Proxmox's own API does not expose temperature at all (confirmed — not
// guessed) — this reads it a completely different way: SSH into the
// Proxmox host and run `sensors -j` (lm-sensors). The SSH key used here is
// registered on the Proxmox side with a FORCED command
// (`command="sensors -j"` in authorized_keys), so even if this code were
// compromised or buggy, that key can run nothing else — see .env.example.
//
// The `sensors -j` JSON shape is NOT a stable generic schema — chip names
// (`k10temp-pci-00c3`) and sub-sensor labels (`Tctl`, `edge`, `Composite`)
// are specific to the actual hardware they were read from, confirmed
// directly against this Proxmox host's real output, not guessed from docs.
// Matching by chip-name PREFIX (not the full name, which includes a PCI
// address suffix that isn't guaranteed stable across reboots) with a
// specific sub-sensor key per chip type below.

export interface ProxmoxSensorReadings {
  cpuTempC: number | null;
  /** `amdgpu-pci*` is real hardware, not a stray/misattributed reading —
   * confirmed: every non-"G" desktop Ryzen since the 7000 series ships a
   * small built-in RDNA2 display-output GPU (2 CU) even with no discrete
   * card installed, and Proxmox's amdgpu driver picks it up like any other
   * GPU. So this can be non-null on a machine with "no GPU" in the
   * ordinary sense — it's the CPU's own graphics engine, not a phantom
   * discrete card. */
  gpuTempC: number | null;
  nvmeTempC: number | null;
}

const SSH_TIMEOUT_MS = 8_000;

export function isSensorsConfigured(): boolean {
  return Boolean(process.env.PROXMOX_SSH_HOST && process.env.PROXMOX_SSH_KEY_PATH);
}

function runSshSensors(): Promise<string> {
  const host = process.env.PROXMOX_SSH_HOST;
  const keyPath = process.env.PROXMOX_SSH_KEY_PATH;
  if (!host || !keyPath) {
    return Promise.reject(new Error("PROXMOX_SSH_HOST / PROXMOX_SSH_KEY_PATH not set"));
  }

  return new Promise<string>((resolve, reject) => {
    // No command argument needed/possible — the remote authorized_keys
    // entry forces `sensors -j` regardless of what's requested here.
    const child = spawn(
      "ssh",
      [
        "-i",
        keyPath,
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ConnectTimeout=5",
        `root@${host}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("SSH sensors request timed out"));
    }, SSH_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout);
      else reject(new Error(`ssh exited ${code}: ${stderr.trim().slice(0, 300)}`));
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/** First top-level chip object whose key starts with `prefix`, or undefined. */
function findChip(data: Record<string, unknown>, prefix: string): Record<string, unknown> | undefined {
  const key = Object.keys(data).find((k) => k.startsWith(prefix));
  return key ? (data[key] as Record<string, unknown>) : undefined;
}

function readTemp(chip: Record<string, unknown> | undefined, sensorLabel: string): number | null {
  if (!chip) return null;
  const sensor = chip[sensorLabel] as Record<string, unknown> | undefined;
  const value = sensor?.temp1_input;
  return typeof value === "number" ? value : null;
}

export async function fetchSensorReadings(): Promise<ProxmoxSensorReadings> {
  const raw = await runSshSensors();
  const data = JSON.parse(raw) as Record<string, unknown>;
  return {
    cpuTempC: readTemp(findChip(data, "k10temp"), "Tctl"),
    gpuTempC: readTemp(findChip(data, "amdgpu-pci"), "edge"),
    nvmeTempC: readTemp(findChip(data, "nvme-pci"), "Composite"),
  };
}
