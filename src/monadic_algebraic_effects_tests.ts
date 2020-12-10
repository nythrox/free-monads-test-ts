import { A } from 'ts-toolbelt';
import {
  handler,
  Effect,
  perform,
  of,
  Action,
} from './MONADIC_algebraic_effects';
import {
  Async,
  foreach,
  List,
  waitFor,
} from './monadic_algebraic_effects_premade';
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
Array.prototype.reduce;

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
run(handleTest1(handleTest0(dostuff)), (p) => p.then(console.log));
export interface Exception<T> extends Effect<'exn', T, T> {}
export const raise = <T>(error: T) => perform<Exception<T>>('exn')(error);

type Result<T> = { type: 'error'; value: T } | { type: 'success'; value: T };

function try$<A, U, E extends Effect>(program: Action<A, E | Exception<U>>) {
  return {
    catch: <E2 extends Effect, A2>(
      fn: (err: U) => Action<A2, E2>,
    ): Action<A | A2, E2> => {
      return handler<any, A>()(
        {
          return: (val) => of(val as A | A2),
        },
        {
          exn: (val, exec, resume, then) => {
            const res = fn(val);
            exec(res)(then);
          },
        },
      )(program) as any;
    },
  };
}

const program = Effect.do(function* () {
  yield* raise(Error('somethign went wrong'));
  yield* raise('somethign went wrong again');
  return 'success';
});

const program2 = try$(program).catch((e) =>
  Effect.do(function* () {
    console.log('error: ', e);
    return 'failure';
  }),
);

program;
program2;

const programChain = pipe(
  foreach([1, 2, 3, 4, 5]),
  chain((num) => of(num)),
);

const programtetst = {
  type: 'map',
  mapper: (n) => n * 2,
  after: {
    type: 'handler',
    handlers: {
      name: 'jason',
    },
    program: {
      type: 'chain',
      chainer: (val) => ({
        type: 'effect',
        effect: { key: 'name', value: val },
      }),
      after: {
        type: 'done',
        value: 5,
      },
    },
  },
};

map((n) => n * 2)(
  handle({
    name: 'jason',
  })(chain((val) => effect('name')(val))(of(5))),
);
