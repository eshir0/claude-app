export interface IpSummaryDTO {
  ip: string;
  sources: string[];
  country: string | null;
  city: string | null;
  hitCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface AccessLogEntryDTO {
  id: string;
  source: string;
  method: string;
  path: string;
  userAgent: string | null;
  at: string;
}
