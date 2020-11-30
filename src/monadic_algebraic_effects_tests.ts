import {
  handler,
  Effect,
  perform,
  of,
  Action,
} from './MONADIC_algebraic_effects';
import { waitFor } from './monadic_algebraic_effects_premade';
interface Test0 extends Effect<'test0', string, string> {}
interface Test1 extends Effect<'test1', string, string> {}
const test0 = perform<Test0>('test0');
const test1 = perform<Test1>('test1');
const dostuff = Effect.do(function* () {
  const hi0 = yield* test1('hi0');
  const hi1 = yield* test1('hi1');
  const hi2 = yield* test0('hi2');
  const hi3 = yield* test0('hi3');
  return hi0 + hi1 + hi2 + hi3;
});

const handleTest0 = handler<Test0, string>()(
  { return: (val) => of(val + '.t0') },
  {
    test0(val, exec, resume, then) {
      resume(val)((res) => {
        then('~' + res + '~');
      });
    },
  },
);

const handleTest1 = handler<Test1, string>()(
  {
    return: (val) => of(val + '.t1'),
  },
  {
    test1(val, exec, resume, then) {
      resume(val)((res) => {
        then('(' + res + ')');
      });
    },
  },
);

const program = run(handleTest1(handleTest0(dostuff)), (p) =>
  p.then(console.log),
);
