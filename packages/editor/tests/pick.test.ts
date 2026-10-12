import { describe, expect, it } from 'vitest';
import { parse, defaultRegistry } from '@kalketa/core';
import { pickOf, replacePickKey } from '../src/logic/pick.js';

const statementOf = (source: string) => parse(source, { isUnit: (n) => defaultRegistry.isUnit(n), predefined: ['Nyty'] }).sheet.statements[0];

describe('a row chosen from a table, and the value of one of its columns', () => {
  it('takes the column of a number clicked: after the call, or in place of the one there', () => {
    const plain = 'd := pick(Nyty, "6")';
    const info = pickOf(statementOf(plain))!;
    expect(replacePickKey(plain, info, '8')).toBe('d := pick(Nyty, "8")');
    expect(replacePickKey(plain, info, '8', 'c_112')).toBe('d := pick(Nyty, "8").c_112');
    const taken = 'd := pick(Nyty, "6").c_112 | mm';
    const again = pickOf(statementOf(taken))!;
    expect(again.column).toBe('c_112');
    expect(replacePickKey(taken, again, '10', 'd')).toBe('d := pick(Nyty, "10").d | mm');
    expect(replacePickKey(taken, again, '10')).toBe('d := pick(Nyty, "10").c_112 | mm');
  });
});
