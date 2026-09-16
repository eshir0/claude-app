import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isTransientNetworkError } from "./errors.ts";

describe("isTransientNetworkError", () => {
  test("recognizes the pveproxy worker-recycling failure modes seen in practice", () => {
    assert.equal(isTransientNetworkError(new Error("write EPROTO ...wrong version number...")), true);
    assert.equal(
      isTransientNetworkError(new Error("Client network socket disconnected before secure TLS connection was established")),
      true,
    );
    assert.equal(isTransientNetworkError(new Error("connect ECONNREFUSED 192.168.1.24:8006")), true);
    assert.equal(isTransientNetworkError(new Error("read ECONNRESET")), true);
    assert.equal(isTransientNetworkError(new Error("Proxmox API request timed out")), false);
  });

  test("does not mask the certificate fingerprint mismatch as transient", () => {
    const err = new Error("Proxmox TLS certificate fingerprint mismatch — refusing to connect");
    assert.equal(isTransientNetworkError(err), false);
  });

  test("handles a non-Error thrown value", () => {
    assert.equal(isTransientNetworkError("ECONNRESET"), true);
    assert.equal(isTransientNetworkError("something else"), false);
  });
});
