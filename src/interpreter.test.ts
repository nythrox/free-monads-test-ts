import { add, call, evaluate, fun, v } from './interpreter';

export {};
describe('intrepreter', () => {
  test('abcd', () => {
    const plusOne = fun('num', add(v('num'), 1));
    const eleven = call(plusOne, 10);
    const result = evaluate(eleven, {});
    expect(result).toBe(11);
  });
}); 