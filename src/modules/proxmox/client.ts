import "server-only";
import https from "node:https";
import type { TLSSocket } from "node:tls";

// Proxmox VE's web UI/API normally runs on a self-signed certificate (no
// public CA), so this deliberately does NOT do normal CA-chain verification
// (rejectUnauthorized would just always fail, or a naive `rejectUnauthorized:
// false` would accept literally any certificate — no protection at all,
// especially relevant since this may be reached over the public internet).
// Instead: pin the exact certificate fingerprint the admin saw when setting
// this up (`GET /nodes` returns each node's own `ssl_fingerprint`) and
// refuse the connection if a presented certificate doesn't match it byte for
// byte — this is real MITM protection without needing a CA-signed cert.
//
// IMPORTANT (found by actually testing the reject path, not assumed): the
// `checkServerIdentity` option's return value does NOT reliably abort the
// connection when `rejectUnauthorized: false` is also set — verified this
// empirically against the real Proxmox server (a deliberately-wrong
// fingerprint still got a 200 response back). The fix that was actually
// confirmed to work: check the peer certificate manually after the TLS
// handshake (`secureConnect`) and forcibly destroy the socket on mismatch.
function normalizeFingerprint(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-F]/g, "");
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set — see .env.example (Proxmox integration section).`);
  }
  return v;
}

/** True only when all Proxmox env vars are present — callers use this to
 * show a clean "not configured" state instead of a thrown error. */
export function isProxmoxConfigured(): boolean {
  return Boolean(
    process.env.PROXMOX_URL &&
      process.env.PROXMOX_TOKEN_ID &&
      process.env.PROXMOX_TOKEN_SECRET &&
      process.env.PROXMOX_SSL_FINGERPRINT,
  );
}

/**
 * GETs `{PROXMOX_URL}/api2/json{path}` with API token auth and certificate
 * pinning, and returns the response's `data` field parsed as T. Proxmox's
 * API only ever wraps successful responses as `{ "data": ... }`.
 */
export function proxmoxRequest<T>(path: string): Promise<T> {
  const baseUrl = requireEnv("PROXMOX_URL");
  const tokenId = requireEnv("PROXMOX_TOKEN_ID");
  const tokenSecret = requireEnv("PROXMOX_TOKEN_SECRET");
  const expectedFingerprint = normalizeFingerprint(requireEnv("PROXMOX_SSL_FINGERPRINT"));

  const url = new URL(`/api2/json${path}`, baseUrl);

  return new Promise<T>((resolve, reject) => {
    // A fresh, non-keep-alive agent for every call — this must never reuse
    // a socket across requests/instances without each one independently
    // going through its own TLS handshake and fingerprint check.
    const agent = new https.Agent({ keepAlive: false, maxCachedSessions: 0 });

    const req = https.request(
      url,
      {
        method: "GET",
        headers: { Authorization: `PVEAPIToken=${tokenId}=${tokenSecret}` },
        // Disables Node's normal CA-chain check (which would otherwise
        // reject every self-signed Proxmox cert outright) — the manual
        // fingerprint check below on the `socket` is the real gate.
        rejectUnauthorized: false,
        agent,
        timeout: 10_000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Proxmox API HTTP ${status}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            const parsed = JSON.parse(body) as { data: T };
            resolve(parsed.data);
          } catch (err) {
            reject(new Error(`Failed to parse Proxmox response: ${(err as Error).message}`));
          }
        });
      },
    );

    req.on("socket", (socket) => {
      // https.request's socket is always a TLSSocket at runtime — the base
      // Socket type in @types/node just doesn't narrow it automatically.
      const tlsSocket = socket as TLSSocket;
      tlsSocket.on("secureConnect", () => {
        const cert = tlsSocket.getPeerCertificate();
        const actual = normalizeFingerprint(cert?.fingerprint256 ?? "");
        if (!actual || actual !== expectedFingerprint) {
          req.destroy(
            new Error(
              "Proxmox TLS certificate fingerprint mismatch — refusing to connect (configured " +
                "PROXMOX_SSL_FINGERPRINT does not match what the server presented; possible MITM " +
                "or the cert was regenerated — re-check via the Proxmox UI and update the env var).",
            ),
          );
        }
      });
    });

    req.on("timeout", () => req.destroy(new Error("Proxmox API request timed out")));
    req.on("error", reject);
    req.end();
  });
}
