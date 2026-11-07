import { describe, expect, it } from 'vitest';
import { dropChangedExampleMarks } from '../src/logic/exampleMark.js';

describe('the mark of an example value', () => {
  const line = "M := 54 kN·m {example}  ' ohybový moment";

  it('goes when the value changes', () => {
    expect(dropChangedExampleMarks(line, "M := 60 kN·m {example}  ' ohybový moment")).toBe("M := 60 kN·m  ' ohybový moment");
    expect(dropChangedExampleMarks(line, 'M := 54 kN·m·2 {example}')).toBe('M := 54 kN·m·2');
  });

  it('stays when only the comment or nothing changes', () => {
    expect(dropChangedExampleMarks(line, "M := 54 kN·m {example}  ' moment uprostřed")).toBe("M := 54 kN·m {example}  ' moment uprostřed");
    expect(dropChangedExampleMarks(line, line)).toBe(line);
  });

  it('reads an apostrophe in quotes as text', () => {
    const quoted = `a := 1 {example}  source "O'Brien"`;
    expect(dropChangedExampleMarks(quoted, `a := 1 {example}  source "O'Brien"`)).toBe(quoted);
  });

  it('leaves lines without the mark alone', () => {
    expect(dropChangedExampleMarks('a := 1', 'a := 2')).toBe('a := 2');
  });
});
