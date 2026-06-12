/**
 * Finds where the first complete sentence ends so early TTS can start
 * speaking while the rest of the response is still streaming.
 *
 * A naive /[.!?]\s/ split chops sentences at abbreviations ("Dr. Smith"),
 * initials ("J. Doe"), and numbered lists ("1. Check the…"), producing
 * audible fragments. This walks sentence-ending punctuation and skips
 * boundaries that are clearly not sentence ends.
 */

// Common abbreviations (and single capital initials) that end with a period
// but do not end a sentence.
const NON_TERMINAL_ENDING =
  /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|approx|dept|est|Inc|Ltd|Co|No|Vol|Fig|al|e\.g|i\.e|U\.S|U\.K)|\b[A-Z]|^\s*\d{1,2})\.$/;

/**
 * Returns the index just past the first sentence-ending punctuation mark,
 * including any trailing whitespace, or -1 if no complete sentence has
 * streamed in yet. Callers can `slice(0, end)` for the sentence and
 * `slice(end)` for the remainder without losing characters.
 */
export function findFirstSentenceEnd(text: string): number {
  const punctuation = /[.!?](?=\s)/g;
  let match: RegExpExecArray | null;

  while ((match = punctuation.exec(text)) !== null) {
    const end = match.index + 1;
    if (text[match.index] === '.' && NON_TERMINAL_ENDING.test(text.slice(0, end))) {
      continue;
    }
    // Consume trailing whitespace so the remainder starts at the next word
    let cut = end;
    while (cut < text.length && /\s/.test(text[cut])) cut++;
    return cut;
  }
  return -1;
}
