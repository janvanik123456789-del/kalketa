/**
 * The slider of an input (a := -2 {slider=-5..5}): the number of the line read
 * and written in place, rounded to the step of the slider. Only a line whose
 * value is a plain number (with its unit, if any) has one.
 */

/** Where the number stands in the line: "a := -2 {slider=…}" has −2 at 5..7. */
export function inputNumber(line: string): { start: number; end: number; value: number } | undefined {
  const m = /^(\s*[\p{L}_][\p{L}\p{N}_]*\s*:=\s*)([-−]?\s*\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)(?=\s*(?:[\p{L}°%][\p{L}\p{N}·/^²³⁻¹°%]*\s*)?(?:\{|'|$))/u.exec(line);
  if (!m) return undefined;
  const text = m[2]!;
  return { start: m[1]!.length, end: m[1]!.length + text.length, value: Number(text.replace('−', '-').replace(/\s+/g, '')) };
}

/** The step of a slider: as given, else a round hundredth of its range (0,1 for −5 .. 5). */
export function sliderStep(slider: { readonly low: number; readonly high: number; readonly step?: number }): number {
  if (slider.step) return slider.step;
  const raw = (slider.high - slider.low) / 100;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((k) => k * power).find((s) => s >= raw) ?? raw;
}

/** The value at a share of the slider (0 … 1), on its step. */
export function sliderValue(slider: { readonly low: number; readonly high: number; readonly step?: number }, share: number): number {
  const step = sliderStep(slider);
  const v = slider.low + Math.min(1, Math.max(0, share)) * (slider.high - slider.low);
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9), placesOf(slider.low));
  // Steps counted from the start of the slider: 1 .. 1000 by 10 is 1, 11, 21 …, never 0 below its start.
  const onStep = slider.low + Math.round((v - slider.low) / step) * step;
  return Number(Math.min(slider.high, Math.max(slider.low, onStep)).toFixed(Math.min(12, decimals)));
}

/** Places after the decimal point of a number as written: 2 of 0.25, 0 of 3. */
function placesOf(x: number): number {
  const text = String(x);
  return text.includes('.') && !text.includes('e') ? text.length - text.indexOf('.') - 1 : 0;
}

/** Whole numbers only: a slider whose step is 1 from a whole start. */
export function isWholeSlider(slider: { readonly low: number; readonly high: number; readonly step?: number }): boolean {
  return slider.step === 1 && Number.isInteger(slider.low);
}

/** The slider attribute ("1..1000..1") for whole numbers, or without the step again; the bounds become whole. */
export function wholeSliderText(slider: { readonly low: number; readonly high: number; readonly step?: number }, whole: boolean): string {
  if (!whole) return `${slider.low}..${slider.high}`;
  const low = Math.ceil(slider.low);
  const high = Math.max(low + 1, Math.floor(slider.high));
  return `${low}..${high}..1`;
}

/** The line with another number in place of its own. */
export function withInputNumber(line: string, value: number): string {
  const at = inputNumber(line);
  return at ? `${line.slice(0, at.start)}${value}${line.slice(at.end)}` : line;
}
