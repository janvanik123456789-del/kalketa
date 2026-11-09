import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { llmsTxt } from '../src/logic/llmsTxt.js';

const file = new URL('../../../llms.txt', import.meta.url);

describe('llms.txt', () => {
  it('is what the program makes of its guide (npm run llms writes it again)', () => {
    const made = llmsTxt();
    if (process.env['KALKETA_WRITE_LLMS'] === '1') writeFileSync(file, made);
    expect(existsSync(file), 'llms.txt is missing: npm run llms').toBe(true);
    expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), 'llms.txt is out of date: npm run llms').toBe(made);
  });

  it('names every built-in function and stays short enough for a chat', () => {
    const made = llmsTxt();
    expect(made).toMatch(/Built-in functions: .*sqrt\(/);
    expect(made).toContain('E-UNDEFINED:');
    expect(made.length).toBeLessThan(120_000);
  });

  it('teaches only code that the program calculates without an error', () => {
    // Every block of code in the file is a piece of a sheet: calculated, none has an error.
    const fence = '`'.repeat(3);
    const blocks = [...llmsTxt().matchAll(new RegExp(`^${fence}\\n([\\s\\S]*?)\\n${fence}$`, 'gm'))].map((m) => m[1]!);
    expect(blocks.length).toBeGreaterThan(5);
    for (const block of blocks) expect(evaluateSheet(block).diagnostics.filter((d) => d.severity === 'error'), block).toEqual([]);
  });
});
