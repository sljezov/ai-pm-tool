import type { MockupElement } from "./document";

/** Old AI proposals sometimes represented calendars as tables; keep their IDs and data intact. */
export function isCalendarElement(element: MockupElement) {
  return element.type === "calendar" || (element.type === "table" && (element.props?.variant === "calendar" || (!element.props?.variant && /calendar|kalendr/iu.test(`${element.id} ${element.label ?? ""}`))));
}

export function fieldInputType(element: MockupElement) {
  return element.props?.inputType ?? (/select/iu.test(element.id) || /^vali\b/iu.test(element.props?.placeholder ?? "") ? "select" : "text");
}

export function calendarPeriod(element: MockupElement) {
  const months = ["jaanuar", "veebruar", "märts", "aprill", "mai", "juuni", "juuli", "august", "september", "oktoober", "november", "detsember"];
  const [monthName, yearText] = (element.props?.monthLabel ?? "").toLocaleLowerCase("et").trim().split(/\s+/);
  const month = months.indexOf(monthName);
  const year = Number(yearText);
  const known = month >= 0 && Number.isInteger(year) && year >= 1900 && year <= 2200;
  return { days: known ? new Date(Date.UTC(year, month + 1, 0)).getUTCDate() : 31, offset: element.props?.startWeekday ?? (known ? (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7 : 0) };
}

export function minimumElementHeight(element: MockupElement, width: number) {
  const lines = (text: string | undefined) => text ? Math.max(1, Math.ceil(text.length / Math.max(8, Math.floor((width - 32) / 8)))) : 0;
  if (element.type === "field") return (fieldInputType(element) === "textarea" ? 112 : 72) + 20 * Math.max(1, lines(element.label));
  if (element.type === "button") return 48;
  if (isCalendarElement(element)) return 480 + 20 * lines(element.text);
  if (element.type === "table" && !element.children?.length) {
    const columns = element.props?.columns ?? element.props?.headers?.length ?? 3;
    const chars = Math.max(2, Math.floor(((width - 24) / columns - 24) / 7));
    const rows = element.props?.rows ?? Array.from({ length: 4 }, () => ["Näidis", "Kinnitatud", "Vaata"]);
    const rowHeight = rows.reduce((total, row) => total + Math.max(42, 22 + 20 * Math.max(1, ...row.slice(0, columns).map(cell => Math.ceil(cell.length / chars)))), 0);
    return 112 + rowHeight + 20 * lines(element.text);
  }
  if (element.type === "list" && !element.children?.length) return 56 + 48 * (element.props?.items?.length ?? 3) + 20 * lines(element.text);
  if (element.type === "form" && !element.children?.length) return 280;
  if (element.type === "alert" || element.type === "confirmation") return Math.max(64, 40 + 20 * (lines(element.label) + lines(element.text)));
  if (element.type === "heading") return 24 + 30 * Math.max(1, lines(element.text ?? element.label));
  if (element.type === "text") return 24 + 20 * Math.max(1, lines(element.text ?? element.label));
  return 32;
}
