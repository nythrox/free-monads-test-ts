import { add, call, evaluate, fun, v } from './interpreter-cps';

export {};
describe('interpreter cps', () => {
  test('add', () => {
    const plusOne = fun('num', add(v('num'), 1));
    const eleven = call(plusOne, 10);
    evaluate(eleven, {}, (result) => {
      expect(result).toBe(11);
    });
  });
});
