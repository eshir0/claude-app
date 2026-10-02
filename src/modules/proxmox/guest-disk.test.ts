import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { summarizeGuestFsInfo, classifyGuestAgentError } from "./guest-disk.ts";

const GB = 1024 ** 3;

describe("summarizeGuestFsInfo", () => {
  test("sums a Linux guest's real filesystems", () => {
    const result = [
      { name: "sda2", mountpoint: "/", type: "ext4", "total-bytes": 30 * GB, "used-bytes": 12 * GB },
      { name: "sda1", mountpoint: "/boot/efi", type: "vfat", "total-bytes": 0.5 * GB, "used-bytes": 0.01 * GB },
    ];
    assert.deepEqual(summarizeGuestFsInfo(result), { used: 12 * GB + 0.01 * GB, total: 30 * GB + 0.5 * GB });
  });

  test("counts a filesystem mounted twice (bind mount / subvolume) once", () => {
    const result = [
      { name: "dm-0", mountpoint: "/", type: "btrfs", "total-bytes": 40 * GB, "used-bytes": 10 * GB },
      { name: "dm-0", mountpoint: "/home", type: "btrfs", "total-bytes": 40 * GB, "used-bytes": 10 * GB },
    ];
    assert.deepEqual(summarizeGuestFsInfo(result), { used: 10 * GB, total: 40 * GB });
  });

  test("skips snaps, ISOs, memory-backed, overlay and network mounts", () => {
    const result = [
      { name: "sda1", mountpoint: "/", type: "ext4", "total-bytes": 20 * GB, "used-bytes": 5 * GB },
      { name: "loop0", mountpoint: "/snap/core/1", type: "squashfs", "total-bytes": 1 * GB, "used-bytes": 1 * GB },
      { name: "sr0", mountpoint: "/media/cdrom", type: "iso9660", "total-bytes": 4 * GB, "used-bytes": 4 * GB },
      { name: "nas", mountpoint: "/mnt/nas", type: "nfs4", "total-bytes": 4000 * GB, "used-bytes": 3000 * GB },
      { name: "overlay", mountpoint: "/var/lib/docker/x", type: "overlay", "total-bytes": 20 * GB, "used-bytes": 5 * GB },
    ];
    assert.deepEqual(summarizeGuestFsInfo(result), { used: 5 * GB, total: 20 * GB });
  });

  test("handles a Windows guest", () => {
    const result = [
      { name: "\\\\?\\Volume{a}\\", mountpoint: "C:\\", type: "NTFS", "total-bytes": 100 * GB, "used-bytes": 60 * GB },
      { name: "\\\\?\\Volume{b}\\", mountpoint: "System Reserved", type: "NTFS", "total-bytes": 0.5 * GB, "used-bytes": 0.1 * GB },
    ];
    assert.deepEqual(summarizeGuestFsInfo(result), { used: 60 * GB + 0.1 * GB, total: 100 * GB + 0.5 * GB });
  });

  test("ignores entries without usable byte counts", () => {
    const result = [
      { name: "sda1", mountpoint: "/", type: "ext4" },
      { name: "sdb1", mountpoint: "/data", type: "ext4", "total-bytes": 0, "used-bytes": 0 },
      { name: "sdc1", mountpoint: "/x", type: "ext4", "total-bytes": -1, "used-bytes": 1 },
      { name: "sdd1", mountpoint: "/y", type: "ext4", "total-bytes": "10", "used-bytes": 1 },
    ];
    assert.equal(summarizeGuestFsInfo(result), null);
  });

  test("anything that isn't an array is null", () => {
    assert.equal(summarizeGuestFsInfo(undefined), null);
    assert.equal(summarizeGuestFsInfo({ result: [] }), null);
    assert.equal(summarizeGuestFsInfo([]), null);
  });
});

describe("classifyGuestAgentError", () => {
  test("403 means the API token lacks VM.GuestAgent.Audit", () => {
    assert.equal(classifyGuestAgentError(new Error("Proxmox API HTTP 403: Permission check failed")), "no-permission");
  });
  test("anything else means the agent isn't available", () => {
    assert.equal(classifyGuestAgentError(new Error("Proxmox API HTTP 500: QEMU guest agent is not running")), "no-agent");
    assert.equal(classifyGuestAgentError(new Error("Proxmox API HTTP 500: No QEMU guest agent configured")), "no-agent");
    assert.equal(classifyGuestAgentError(new Error("Proxmox API request timed out")), "no-agent");
  });
});
