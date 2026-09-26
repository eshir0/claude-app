// Split out from logic.ts on purpose: this file must stay free of any
// Node built-in import (unlike logic.ts, which pulls in `node:net` for IP
// parsing) so AccessLogView.tsx ("use client") can import isSuspiciousPath
// directly to highlight a request path in the browser, without dragging a
// server-only-incompatible module into the client bundle.

// Flags an ip red on the dashboard when it has requested a path that's a
// well-known vulnerability-scanner/exploit probe (WordPress, phpMyAdmin,
// .env/.git secret-file grabs, path traversal, Java consoles, etc.) rather
// than anything this app, OmniRoute, Proxmox, or the Minecraft server
// actually serves. Best-effort from a curated substring list, NOT a real
// IDS/WAF — it will miss novel/targeted attacks and can occasionally
// false-positive on an oddly-named legitimate path. Matching is
// case-insensitive and substring-based on purpose (scanners vary
// casing/prefix directories constantly).
const SUSPICIOUS_PATH_SUBSTRINGS: string[] = [
  // Secret/config file grabs
  ".env",
  ".git/config",
  ".aws/credentials",
  ".ssh/id_rsa",
  "/etc/passwd",
  "wp-config.php",
  // WordPress / PHP CMS probing (this stack runs none of these)
  "wp-login.php",
  "wp-admin",
  "wp-content",
  "xmlrpc.php",
  // Common webshell / uploaded-backdoor filenames
  "shell.php",
  "c99.php",
  "r57.php",
  "alfa.php",
  "eval-stdin.php",
  // DB admin panels
  "phpmyadmin",
  "adminer.php",
  // Path traversal attempts
  "../../",
  "..%2f..%2f",
  "%2e%2e%2f",
  // Java/app-server management consoles and known CVE-scan targets
  "/actuator",
  "/manager/html",
  "/geoserver",
  "/solr/",
  "/druid/",
  "/jolokia",
  "/telescope",
  "/_profiler",
  // Router/IoT exploit probes
  "boaform",
  "hnap1",
  "cgi-bin/",
];

/**
 * true when `path` contains any known scanner/exploit-probe substring —
 * see the constant above for what's covered and the caveats.
 */
export function isSuspiciousPath(path: string): boolean {
  const lower = path.toLowerCase();
  return SUSPICIOUS_PATH_SUBSTRINGS.some((s) => lower.includes(s));
}
