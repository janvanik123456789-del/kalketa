import { describe, expect, it } from 'vitest';
import { add, divide, exact, fromDecimal, fromNumber, multiply, power, squareRoot, subtract, toNumber, type Exact } from '../src/values/exact.js';

const f = (e: Exact | undefined) => (e ? `${e.num}/${e.den}${e.root === 1n ? '' : `√${e.root}`}` : 'none');

describe('exact forms of numbers', () => {
  it('reads numbers as written: 0.1 is 1/10, 273.15 is 5463/20, 1e-9 a fraction too', () => {
    expect(f(fromDecimal('0.1'))).toBe('1/10');
    expect(f(fromDecimal('273.15'))).toBe('5463/20');
    expect(f(fromDecimal('1e-9'))).toBe('1/1000000000');
    expect(f(fromNumber(0.1 + 0.2))).toBe('none');
    expect(f(fromNumber(0.3))).toBe('3/10');
  });

  it('keeps fractions through + − · / and whole powers', () => {
    const third = exact(1n, 3n)!;
    expect(f(add(third, exact(1n, 2n)!))).toBe('5/6');
    expect(f(subtract(exact(40n)!, exact(49n, 1n)!))).toBe('-9/1');
    expect(f(divide(exact(49n)!, exact(9n)!))).toBe('49/9');
    expect(f(power(exact(2n, 3n)!, -2))).toBe('9/4');
  });

  it('takes square roots of fractions, the square factor out: √169 = 13, √(1/2) = √2/2, √8 = 2√2', () => {
    expect(f(squareRoot(exact(169n)!))).toBe('13/1');
    expect(f(squareRoot(exact(1n, 2n)!))).toBe('1/2√2');
    expect(f(squareRoot(exact(8n)!))).toBe('2/1√2');
    expect(f(multiply(squareRoot(exact(2n)!)!, squareRoot(exact(6n)!)!))).toBe('2/1√3');
    expect(toNumber(squareRoot(exact(1n, 2n)!)!)).toBeCloseTo(Math.SQRT1_2, 15);
  });

  it('gives up where the result is no fraction times one root', () => {
    expect(add(squareRoot(exact(2n)!)!, exact(1n)!)).toBeUndefined();
    expect(squareRoot(exact(-4n)!)).toBeUndefined();
    expect(divide(exact(1n)!, exact(0n)!)).toBeUndefined();
  });
});
