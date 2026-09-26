// Fixed locale + time zone on purpose: these render during SSR (server runs
// with LANG=C / UTC) AND in the browser (ko-KR / KST). A bare
// toLocaleString() formats differently in each, which is a hydration
// mismatch — React then discards the server HTML and re-renders from the
// root. Pinning both makes the output identical everywhere, and matches
// what Korean browsers already showed.
const LOCALE = "ko-KR";
const TIME_ZONE = "Asia/Seoul";

type DateInput = string | number | Date;

/** e.g. "2026. 9. 26. 오후 12:43:45" */
export function formatDateTime(value: DateInput): string {
  return new Date(value).toLocaleString(LOCALE, { timeZone: TIME_ZONE });
}

/** e.g. "2026. 9. 26." */
export function formatDate(value: DateInput): string {
  return new Date(value).toLocaleDateString(LOCALE, { timeZone: TIME_ZONE });
}
