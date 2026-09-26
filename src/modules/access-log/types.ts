export interface IpSummaryDTO {
  ip: string;
  sources: string[];
  country: string | null;
  city: string | null;
  hitCount: number;
  firstSeen: string;
  lastSeen: string;
  /** true if this ip has ever requested a known scanner/exploit-probe path
   * — see logic.ts#isSuspiciousPath. Heuristic, not a full IDS. */
  isSuspicious: boolean;
}

export interface AccessLogEntryDTO {
  id: string;
  source: string;
  method: string;
  path: string;
  userAgent: string | null;
  at: string;
}
