/**
 * Tidying text copied out of a PDF into the sources (docs/01-filozofie.md,
 * ch. 9.6: text is put in and a person confirms it). A PDF gives one paragraph
 * per printed line, words spaced out for emphasis ("n a m á h á n o"), page
 * numbers, numbered titles as plain text and remains of figures. This turns
 * them back into paragraphs, words and headings, puts a caption "Obr. 31 …"
 * under the picture above it, and lists lines that look like remains of a
 * figure or a formula the PDF garbled ("F-l3 3-E-ľ (45)"): the user decides
 * which of them go.
 *
 * Heading levels follow the numbers: "7." level 1, "7.1" level 2; a case
 * numbered on its own inside a subchapter ("1. Vetknutý nosník…" after "7.5")
 * level 3. Numbered headings already there get their level the same way.
 *
 * Works on the stored notes (the Markdown subset); headings, lists,
 * citations, tables, code and pictures already there stay as they are.
 */

export interface PdfCleanup {
  /** The tidied notes. */
  readonly text: string;
  /**
   * Lines that look like remains of figures, or formulas the PDF garbled, in
   * order; removed when listed in `drop` of applySuspects.
   */
  readonly suspects: readonly Suspect[];
  /**
   * Spaced-out words that were put together. A one-letter preposition next to one
   * cannot be told from its letters ("n a m á h á n o v daném"): the preview shows
   * them, so the user can check.
   */
  readonly joinedWords: readonly string[];
  readonly stats: {
    /** Printed lines joined into paragraphs. */
    readonly joined: number;
    readonly paragraphs: number;
    /** Spaced-out words put together. */
    readonly words: number;
    readonly headings: number;
    readonly pageNumbers: number;
    readonly captions: number;
  };
}

export interface Suspect {
  readonly text: string;
  /** Remains of a figure (best removed), or a formula to be replaced by a picture of it. */
  readonly kind: 'scraps' | 'formula';
}

/** A marker a suspect line carries until the user decides; never stored. */
const SUSPECT = '\u0000suspect:';

const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)\)(\{[^}]*\})?\s*$/;
const STRUCTURE = /^(#{1,3}\s|[-*]\s|>|```|\||---\s*$|\*\*\*\s*$|___\s*$)/;
// A numbered title: "7.1 Druhy nosníků a podpor", "2. Vetknutý nosník se spojitým, rovnoměrně rozloženým břemenem".
const NUMBERED_TITLE = /^(\d{1,2}(?:\.\d{1,2}){0,2})\.?\s+(\p{Lu}[^.;:]{1,118}[^.;:,])$/u;
// A formula with its number, as a PDF gives it when it cannot copy the formula: "F-l3 3-E-ľ (45)".
const NUMBERED_FORMULA = /\(\d{1,3}\)\s*$/;
const EXISTING_HEADING = /^(#{1,3})\s+(.*?)(\s*\{#T\d+\})?\s*$/;
// A caption with its number, or without one ("Obr.: Model konstrukce a zatížení").
const CAPTION = /^(Obr\.|Obrázek|Fig\.|Figure)\s*(\d+|:)/i;
// What a task asks the reader to do: a title never says it ("Vypočtěte", "určete", "Find", "Berechnen Sie").
const TASK = /(^|\s)(vypočt[ěe]te|vypočítejte|určete|stanovte|formulujte|nakreslete|vykreslete|odvoďte|zjistěte|navrhněte|posuďte|dokažte|řešte|find|calculate|determine|compute|berechnen|bestimmen|ermitteln)(\s|$|[.,:])/iu;
// A worked example starting: "Příklad 1", "Problem 2. Diameter of pipe…", "Example 1. A pipe 3 inches…".
const EXAMPLE = /^(Příklad|Úloha|Řešený příklad|Example|Problem|Exercise|Aufgabe|Beispiel)\s+(?:(?:č|No|Nr)\.\s*)?((?:[IVXL]{1,4}-)?\d{1,3}(?:\.\d{1,3})?[a-z]?)\s*[.:)]?\s*(.*)$/iu;

/** A token of a spaced-out word: one or two letters. */
const SHORT = /^\p{L}{1,2}$/u;

/**
 * Letters spaced out for emphasis put together: "n a m á h á n o" → "namáháno",
 * "po j e d n é" → "po jedné", "k o lm ý" → "kolmý". A run has at least three
 * tokens, starts and ends with a single letter, is mostly single letters, and
 * ends before a capital that follows small letters ("s e M 0" stays apart).
 */
export function joinSpacedLetters(line: string): { text: string; words: string[] } {
  const tokens = line.split(' ');
  const out: string[] = [];
  const words: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!SHORT.test(tokens[i]!) || tokens[i]!.length !== 1) {
      out.push(tokens[i]!);
      i++;
      continue;
    }
    // The longest run of short tokens from here; a capital after small letters ends it.
    let j = i + 1;
    while (j < tokens.length && SHORT.test(tokens[j]!) && !(/^\p{Lu}$/u.test(tokens[j]!) && /\p{Ll}/u.test(tokens[j - 1]!))) j++;
    // It ends with a single letter: "…n é se" leaves "se" to the text after it.
    let k = j;
    while (k > i + 1 && tokens[k - 1]!.length !== 1) k--;
    const run = tokens.slice(i, k);
    const singles = run.filter((t) => t.length === 1).length;
    if (run.length >= 3 && singles / run.length >= 0.75) {
      const word = run.join('');
      out.push(word);
      words.push(word);
      i = k;
    } else {
      out.push(tokens[i]!);
      i++;
    }
  }
  let text = out.join(' ');
  // A space left before a comma or bracket that closed a spaced-out word: "kombinovaných ." → "kombinovaných."
  if (words.length > 0) text = text.replace(/(\p{L}) ([.,;:!?)])/gu, '$1$2');
  return { text, words };
}

/** Symbol encoding from 0x20 (Adobe Symbol, the font of Word's equations and of old formula editors). */
const SYMBOL_LOW = Array.from(' !∀#∃%&∋()∗+,−./0123456789:;<=>?≅ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ[∴]⊥_‾αβχδεφγηιϕκλμνοπθρστυϖωξψζ{|}∼');
/** Symbol encoding from 0xA0; 0xF0 (an Apple logo) has no character. */
const SYMBOL_HIGH = Array.from('€ϒ′≤⁄∞ƒ♣♦♥♠↔←↑→↓°±″≥×∝∂•÷≠≡≈…⏐⎯↵ℵℑℜ℘⊗⊕∅∩∪⊃⊇⊄⊂⊆∈∉∠∇®©™∏√⋅¬∧∨⇔⇐⇑⇒⇓◊〈®©™∑⎛⎜⎝⎡⎢⎣⎧⎨⎩⎪\u0000〉∫⌠⎮⌡⎞⎟⎠⎤⎥⎦⎫⎬⎭');

/**
 * Text of a Symbol font that a PDF gives in the private use area (U+F020–U+F0FE,
 * the font's own codes) as the characters they show: "M  0" → "M = 0".
 * Only for a font named Symbol: Wingdings and the like use the same codes for pictures.
 */
/**
 * Letters of the Unicode block of mathematical letters (𝜎, 𝑀𝑃𝑎, 𝐹, 𝛼 from Word's and LaTeX's equations) as
 * plain ones (σ, MPa, F, α), so the text can be searched and read as formulas; only that block changes.
 */
export function plainMathLetters(text: string): string {
  return text.replace(/[\u{1D400}-\u{1D7FF}]/gu, (c) => c.normalize('NFKC'));
}

/** Accents old TeX fonts set as characters of their own beside the letter, and the combining marks they stand for. */
const SPACING_ACCENTS: Readonly<Record<string, string>> = { 'ˇ': '̌', '´': '́', '˚': '̊', '¨': '̈', 'ˆ': '̂', '`': '̀', '˘': '̆', '˝': '̋' };

/** The letters each accent stands over in Czech, Slovak and German: "don´t" keeps its apostrophe. */
const ACCENTED: Readonly<Record<string, string>> = { 'ˇ': 'cdenrstzlCDENRSTZL', '´': 'aeiouylrnAEIOUYLRN', '˚': 'uU', '¨': 'aeiouAEIOU', 'ˆ': 'aeiouAEIOU', '`': 'aeiouAEIOU', '˘': 'aA', '˝': 'ouOU' };

/**
 * Letters with their accents put together, where the PDF has the accent as a character of its own
 * ("pˇríklad", "pr ˚ubˇeh ˚u" from old TeX fonts) → "příklad", "průběhů". The háček of a capital
 * letter may come after its word ("Rešeníˇ"): it goes to that letter ("Řešení"). A space before the
 * accent is the PDF's guess, kept where the letter may start a word ("příklad ˇc." → "příklad č."),
 * dropped where no Czech word starts so (ů, ě, ň: "stup ˇnů" → "stupňů").
 */
export function joinedAccents(text: string): string {
  return text
    .replace(/((?<=\p{L}) )?([ˇ´˚¨ˆ`˘˝])(\p{L})/gu, (whole: string, space: string | undefined, accent: string, letter: string) => {
      if (!ACCENTED[accent]!.includes(letter)) return whole;
      const inWord = (accent === '˚' && letter === 'u') || (accent === 'ˇ' && 'en'.includes(letter));
      return `${space && !inWord ? ' ' : ''}${letter}${SPACING_ACCENTS[accent]}`.normalize('NFC');
    })
    .replace(/(^|[^\p{L}])([RCSZDTNE])(\p{Ll}+)ˇ(?=[^\p{L}]|$)/gu, (_, start: string, capital: string, rest: string) => `${start}${`${capital}̌`.normalize('NFC')}${rest}`);
}

export function fromSymbolFont(text: string): string {
  return text.replace(/[-]/g, (ch) => {
    const code = ch.charCodeAt(0) - 0xf000;
    const out = code < 0x7f ? SYMBOL_LOW[code - 0x20] : code >= 0xa0 ? SYMBOL_HIGH[code - 0xa0] : undefined;
    return out === undefined || out === '\u0000' ? '' : out;
  });
}

const SUPERSCRIPT: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };

/**
 * A raised part of a line (an exponent) written into it: "⁻⁶" where every
 * character has a superscript form, else "^(…)". A lowered one (an index)
 * as Kalketa writes names: "_a", "_max", "_(h,a-b)" when it has more than a word.
 */
export function shifted(text: string, raised: boolean): string {
  const t = text.trim();
  if (raised) return Array.from(t).every((c) => c in SUPERSCRIPT) ? Array.from(t, (c) => SUPERSCRIPT[c]).join('') : `^(${t})`;
  return /^[\p{L}\p{N}]+$/u.test(t) ? `_${t}` : `_(${t})`;
}

/**
 * A line the PDF could not give as text: a formula (short, few words, ending in
 * its number "(45)") or scraps of a figure or formula. Undefined for real text.
 */
export function formulaOrScraps(line: string): 'formula' | 'scraps' | undefined {
  const text = line.trim();
  const realWords = text.split(/\s+/).filter((w) => /\p{L}{3,}/u.test(w)).length;
  if (NUMBERED_FORMULA.test(text) && text.length <= 60 && realWords <= 3) return 'formula';
  if (wrongScript(text)) return 'formula';
  if (looksLikeScraps(line)) return 'scraps';
  return undefined;
}

/**
 * Letters of a script no engineering text is written in (Syriac, Tamil, Thaana…): a formula whose
 * math font the PDF maps to wrong characters ("ܸ ݓ ஺ ܵ ݌" from Word's equations). A picture of it is right.
 */
const WRONG_SCRIPT = /[\p{Script=Syriac}\p{Script=Thaana}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Tibetan}\p{Script=Arabic}]/gu;

export function wrongScript(line: string): boolean {
  return (line.match(WRONG_SCRIPT) ?? []).length >= 2;
}

/** A line made of scraps (single letters, symbols): what is left of a figure. */
function looksLikeScraps(line: string): boolean {
  const text = line.trim();
  if (text === '' || /^\d+$/.test(text)) return false;
  if (text.length <= 3) return true;
  const tokens = text.split(/\s+/);
  // One short token that is not a word: "M,mp", "x2=".
  if (tokens.length === 1 && text.length <= 6 && !/^\p{L}{2,}[.,;:!?)]?$/u.test(text)) return true;
  // Two real words make a line of text, however many spaced-out letters it has.
  if (tokens.filter((t) => /\p{L}{3,}/u.test(t)).length >= 2) return false;
  const scraps = tokens.filter((t) => !/\p{L}{3,}/u.test(t)).length;
  return tokens.length >= 2 && scraps / tokens.length >= 0.8;
}

/** Signs text recognition (OCR) leaves where it could not read a formula; rare in a sentence. */
const OCR_SIGNS = /[\^¥«»*`~\\|¬§■]|''|°[^CFK\s]/g;

/**
 * A line of a scan's text layer garbled where the page has a formula: many such signs
 * ("t ui'^\*¥ ^«^°''^*y i^ °?'"), or a short line of an equals sign and scraps ("'»=4=iV-",
 * "1"12d''"). A sentence with a degree (40 °C) or quotes („…“) is none.
 */
export function ocrNoise(line: string): boolean {
  const text = line.trim();
  const signs = (text.match(OCR_SIGNS) ?? []).length;
  if (signs >= 4 && signs / text.length >= 0.05) return true;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return text.length <= 25 && signs >= 2 && letters / text.length < 0.5;
}

export function cleanPdfText(notes: string): PdfCleanup {
  const stats = { joined: 0, paragraphs: 0, words: 0, headings: 0, pageNumbers: 0, captions: 0 };
  const suspects: Suspect[] = [];
  const joinedWords: string[] = [];

  // Blocks as stored: paragraphs between blank lines; one printed line each when copied from a PDF.
  const blocks = notes
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b !== '');

  type Piece = { kind: 'line'; text: string } | { kind: 'keep'; text: string } | { kind: 'heading'; text: string } | { kind: 'figure'; text: string; caption?: string };
  const pieces: Piece[] = [];
  const levels = headingLevels();
  // The level of the last numbered heading: an example is one below it.
  let lastLevel: number | undefined;
  for (const block of blocks) {
    const first = block.split('\n')[0]!;
    if (FIGURE.test(block)) {
      pieces.push({ kind: 'figure', text: block });
      continue;
    }
    // A numbered heading already there gets its level from the numbering, its section id stays.
    const existing = EXISTING_HEADING.exec(block);
    const existingTitle = existing && !block.includes('\n') ? NUMBERED_TITLE.exec(existing[2]!) : null;
    if (existing && existingTitle) {
      const level = levels(existingTitle[1]!, existingTitle[2]!);
      if (level !== existing[1]!.length) stats.headings++;
      lastLevel = level;
      pieces.push({ kind: 'heading', text: `${'#'.repeat(level)} ${existing[2]}${existing[3] ?? ''}` });
      continue;
    }
    if (STRUCTURE.test(first)) {
      const heading = /^(#{1,3})\s/.exec(first);
      if (heading) lastLevel = heading[1]!.length;
      pieces.push({ kind: 'keep', text: block });
      continue;
    }
    for (const raw of block.split('\n')) {
      // A formula the PDF could not copy stays a line of its own, not joined with the text.
      // Short and with few words: "…pro jehož obsah platí (43)" is a sentence pointing at a formula, not one.
      const realWords = raw.trim().split(/\s+/).filter((w) => /\p{L}{3,}/u.test(w)).length;
      if (NUMBERED_FORMULA.test(raw.trim()) && raw.trim().length <= 60 && realWords <= 3) {
        suspects.push({ text: raw.trim(), kind: 'formula' });
        pieces.push({ kind: 'keep', text: `${SUSPECT}${raw.trim()}` });
        continue;
      }
      // A formula a scan's text layer garbled ("t ui'^\*¥ ^«^°''^*y", "''=6-oSr7=^-«««"): a picture of it is better.
      if (ocrNoise(raw) || wrongScript(raw)) {
        suspects.push({ text: raw.trim(), kind: 'formula' });
        pieces.push({ kind: 'keep', text: `${SUSPECT}${raw.trim()}` });
        continue;
      }
      // Remains of a figure are found before anything is joined in them.
      if (looksLikeScraps(raw)) {
        suspects.push({ text: raw.trim(), kind: 'scraps' });
        pieces.push({ kind: 'keep', text: `${SUSPECT}${raw.trim()}` });
        continue;
      }
      const spaced = joinSpacedLetters(raw.trim());
      stats.words += spaced.words.length;
      joinedWords.push(...spaced.words);
      const line = spaced.text;
      if (/^\d{1,4}$/.test(line)) {
        stats.pageNumbers++;
        continue;
      }
      // "Příklad 1": a heading one below the heading above it; a short title after it goes with it
      // ("Problem 2. Diameter of pipe…"), the start of its statement stays text.
      const example = EXAMPLE.exec(line);
      if (example) {
        const rest = example[3]!.trim();
        // A title is a short sentence of its own ("Diameter of pipe to give a given discharge."); a line running on is the statement.
        const titled = rest.length <= 70 && /^\p{Lu}.*\.$/u.test(rest) && !/\.\s/.test(rest) && !TASK.test(rest);
        const level = Math.min(3, (lastLevel ?? 1) + 1);
        stats.headings++;
        pieces.push({ kind: 'heading', text: `${'#'.repeat(level)} ${example[1]} ${example[2]}${titled ? ` ${rest.replace(/\.$/, '')}` : ''}` });
        if (rest !== '' && !titled) pieces.push({ kind: 'line', text: rest });
        continue;
      }
      const title = NUMBERED_TITLE.exec(line);
      // A numbered task ("4.13 Pro daný obvod formulujte rovnici … a vypočtěte") is no title: it tells what to do.
      if (title && block.split('\n').length === 1 && !TASK.test(title[2]!)) {
        stats.headings++;
        lastLevel = levels(title[1]!, title[2]!);
        pieces.push({ kind: 'heading', text: `${'#'.repeat(lastLevel)} ${line}` });
        continue;
      }
      // A title running on to the next line in small letters ("…s jedinou osamělou silou" / "působící v obecné poloze"):
      // the rest belongs to the heading.
      const above = pieces[pieces.length - 1];
      if (above?.kind === 'heading' && !EXAMPLE.test(above.text.replace(/^#+\s*/, '')) && /^\p{Ll}/u.test(line) && line.length < 90 && !/[.!?:;]$/.test(line) && !/\{#T\d+\}$/.test(above.text)) {
        above.text = `${above.text} ${line}`;
        continue;
      }
      // Longer than a printed line: a paragraph already (tidied before), it stays as it is.
      if (line.length > 130) {
        pieces.push({ kind: 'keep', text: line });
        continue;
      }
      pieces.push({ kind: 'line', text: line });
    }
  }

  // Printed lines back into paragraphs: a short line ending a sentence closes one.
  const lengths = pieces.filter((p) => p.kind === 'line').map((p) => p.text.length).sort((a, b) => a - b);
  const typical = lengths[Math.floor(lengths.length * 0.75)] ?? 80;
  const out: string[] = [];
  let paragraph: string[] = [];
  // A caption being read: under a picture (its index in `out`) or on its own.
  let caption: { figure?: number } | undefined;
  const close = () => {
    if (paragraph.length === 0) return;
    let text = paragraph[0]!;
    for (const next of paragraph.slice(1)) {
      // A word broken at the end of a line ("nosní-" + "ku") is put together.
      text = /\p{L}-$/u.test(text) && /^\p{Ll}/u.test(next) ? text.slice(0, -1) + next : `${text} ${next}`;
    }
    stats.joined += paragraph.length - 1;
    stats.paragraphs++;
    if (caption?.figure !== undefined) {
      // "Obr. 31 …" right under a picture is its caption.
      const m = FIGURE.exec(out[caption.figure]!)!;
      out[caption.figure] = `![${text.replace(/[[\]]/g, '')}](${m[2]})${m[3] ?? ''}`;
      stats.captions++;
    } else {
      out.push(text);
    }
    caption = undefined;
    paragraph = [];
  };
  for (const piece of pieces) {
    if (piece.kind !== 'line') {
      close();
      out.push(piece.text);
      continue;
    }
    const previous = pieces[pieces.indexOf(piece) - 1];
    // A caption runs on over its lines ("…, b) na dvou podporách," / "c) s převislými konci") until a new sentence starts.
    if (caption && paragraph.length > 0 && /^\p{Lu}/u.test(piece.text) && !/[,-]$/.test(paragraph[paragraph.length - 1]!)) close();
    const startsCaption = CAPTION.test(piece.text);
    if (startsCaption) {
      close();
      const figureAbove = previous?.kind === 'figure' && !FIGURE.exec(previous.text)![1];
      caption = figureAbove ? { figure: out.length - 1 } : {};
    }
    paragraph.push(piece.text);
    const ends = /[.!?:]$/.test(piece.text) && piece.text.length < typical * 0.8;
    if (ends) close();
  }
  close();

  return { text: `${out.join('\n\n')}\n`, suspects, joinedWords, stats };
}

/**
 * The level of a numbered heading, in the order the headings come: as many as
 * its numbers ("7." 1, "7.1" 2, "7.1.2" 3). A case numbered on its own inside a
 * subchapter ("1." after "7.5") is one below that subchapter (at most 3); the
 * next chapter ("8." after "7.", or a title in capitals) stays a chapter.
 */
function headingLevels(): (number: string, title: string) => number {
  let chapter: number | undefined;
  let deepest = 0;
  return (number, title) => {
    const parts = number.split('.').filter((p) => p !== '').map(Number);
    if (parts.length > 1) {
      chapter = parts[0];
      deepest = parts.length;
      return Math.min(3, parts.length);
    }
    const n = parts[0]!;
    const isChapter = chapter === undefined || deepest < 2 || n === chapter + 1 || title === title.toUpperCase();
    if (isChapter) {
      chapter = n;
      deepest = 1;
      return 1;
    }
    return Math.min(3, deepest + 1);
  };
}

/** The tidied notes without the suspect lines the user chose to drop; the others stay as text. */
export function applySuspects(cleaned: PdfCleanup, drop: ReadonlySet<number>): string {
  let i = 0;
  return cleaned.text
    .split('\n\n')
    .flatMap((block) => {
      if (!block.startsWith(SUSPECT)) return [block];
      const n = i++;
      return drop.has(n) ? [] : [block.slice(SUSPECT.length)];
    })
    .join('\n\n');
}
