export const SOUVENIR_TICKET_WIDTH = 1200;
export const SOUVENIR_TICKET_HEIGHT = 675;

/**
 * A timed run can also reach the final station, so the completion reason alone
 * is not enough to decide whether this run earns a souvenir ticket.
 *
 * @param {"timed" | "line" | null} completionReason
 * @param {"timed" | "line"} gameMode
 */
export function shouldCreateSouvenirTicket(completionReason, gameMode) {
  return completionReason === "line" && gameMode === "line";
}

function sanitizeFileNamePart(value) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * @param {string} cityName
 * @param {string} lineName
 */
export function createSouvenirTicketFileName(cityName, lineName) {
  const city = sanitizeFileNamePart(cityName) || "城市";
  const line = sanitizeFileNamePart(lineName) || "地铁线路";
  return `地铁打字-${city}-${line}-全线纪念票.png`;
}

/**
 * @param {{
 *   cityName: string;
 *   lineName: string;
 *   direction: string;
 *   stationCount: number;
 * }} ticket
 */
export function createSouvenirTicketShareText(ticket) {
  return `我完成了${ticket.cityName}地铁${ticket.lineName}（${ticket.direction}）的全部 ${ticket.stationCount} 站，获得全线通关纪念票。`;
}
