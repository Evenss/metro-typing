/**
 * @typedef {{ nameEn: string, namePinyin: string }} TypingStation
 * @typedef {"en" | "pinyin"} TypingLanguage
 */

/**
 * Build the text shown to the player. Spaces remain visible in both languages,
 * while punctuation that is not part of the typing target is omitted.
 *
 * @param {TypingStation | undefined} station
 * @param {TypingLanguage} language
 */
export function getTypingDisplayText(station, language) {
  if (!station) return "";
  const source = language === "pinyin" ? station.namePinyin : station.nameEn;
  const unsupportedCharacters =
    language === "pinyin" ? /[^a-z0-9ü ]/g : /[^a-z0-9 ]/g;
  return source
    .normalize("NFKC")
    .toLowerCase()
    .replace(unsupportedCharacters, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build the compact character sequence the game expects. Displayed spaces are
 * optional in both languages and therefore never become target characters.
 *
 * @param {TypingStation | undefined} station
 * @param {TypingLanguage} language
 */
export function getTypingTarget(station, language) {
  return getTypingDisplayText(station, language)
    .replaceAll("ü", "v")
    .replaceAll(" ", "");
}

/**
 * Normalize one received character. Whitespace is optional and ignored in
 * both languages; a typed v (or literal ü) matches the displayed pinyin ü.
 *
 * @param {string} character
 * @param {TypingLanguage} language
 */
export function normalizeTypingCharacter(character, language) {
  if (/\s/u.test(character)) return "";
  const normalized = character.normalize("NFKC").toLowerCase();
  return language === "pinyin" ? normalized.replaceAll("ü", "v") : normalized;
}

/**
 * Keep displayed words or syllables separate while mapping every visible
 * character to the compact, space-free input index.
 *
 * @param {string} displayText
 */
export function getTypingDisplayTokens(displayText) {
  const tokens = displayText.split(/\s+/).filter(Boolean);
  let nextStartIndex = 0;
  return tokens.map((token, tokenIndex) => {
    const characters = Array.from(token);
    const startIndex = nextStartIndex;
    nextStartIndex += characters.length;
    return {
      characters,
      startIndex,
      visualSeparator: tokenIndex < tokens.length - 1,
    };
  });
}
