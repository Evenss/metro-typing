const HAN_CHARACTER = /\p{Script=Han}/u;

/**
 * Long Chinese service names do not fit inside the circular route badge.
 * Keep compact Latin and numeric identifiers intact, but abbreviate Chinese
 * labels to their first two characters.
 *
 * @param {string} lineId
 */
export function getLineBadgeLabel(lineId) {
  const value = String(lineId ?? "").trim();
  const characters = Array.from(value);
  const containsHanCharacter = characters.some((character) =>
    HAN_CHARACTER.test(character),
  );

  return containsHanCharacter && characters.length > 2
    ? characters.slice(0, 2).join("")
    : value;
}
