interface Effect<P extends PropertyKey = any, V = any, R = any> {
  name: P;
  value: V;
  __returnWith: R;
}

interface Pure<R> {
  value: R;
  type: 'pure';
}
interface Chain<R, E extends Effect> {
  effect: E;
  type: 'chain';
  then: (val: E['__returnWith']) => FEM<R, E>;
}
interface Handle<
  P extends PropertyKey,
  E extends Effect,
  E2 extends Effect,
  R,
  R2
> {
  type: 'handle';
  handlers: GetScopedHandlers<P, E, E2, R, R2>;
  handle: FEM<R, E>;
}
type GetScopedHandlers<
  P extends PropertyKey,
  E extends Effect,
  E2 extends Effect,
  R,
  R2
> = {
  // return: (val: R) => R2;
} & {
  [val in P]: (val: R, k: (val: any) => void) => Generator<R2>;
  // (
  //   val: E["value"],
  //   k: (val: E["__returnWith"], next: (val: R) => void) => void,
  //   next: (val: FEM<R, never>) => void
  // ) => FEM<R2, E2>;
};

const Handle = <
  P extends PropertyKey,
  E extends Effect,
  E2 extends Effect,
  R,
  R2
>(
  program: FEM<R, E>,
  handlers: GetScopedHandlers<P, E, E2, R, R2>,
) => {
  return ({
    handle: program,
    handlers,
    type: 'handle',
  } as any) as FEM<R2, E>;
};

type FEM<R, E extends Effect> = Chain<R, E> | Pure<R> | Handle<any, E, R, R>;
const Chain = <E extends Effect, R, E2 extends Effect>(
  effect: E,
  then: (val: E['__returnWith']) => FEM<R, E2>,
) =>
  ({
    effect,
    then,
    type: 'chain',
  } as FEM<R, E | E2>);
const Pure = <R, E = never>(value: R) => ({ value, type: 'pure' } as FEM<R, E>);
const Effect = <P extends PropertyKey, T, R>(name: P, value: T) =>
  ({ name, value } as Effect<P, T, R>);
interface Length extends Effect<'length', string, number> {}
const Length = (string: string) => Effect('length', string) as Length;
interface PlusOne extends Effect<'plusOne', number, number> {}
const PlusOne = (num: number) => Effect('plusOne', num) as PlusOne;

type GetHandlers<
  Effects extends Effect,
  Keys extends PropertyKey = Effects['name']
> = {
  [Key in Keys]: Effects extends Effect<infer K, infer V, infer R>
    ? K extends Key
      ? (val: V) => R
      : never
    : never;
};
type HANDLERS = Record<PropertyKey, HANDLER>;

type HANDLER = (
  val: any,
  k: (val: any, next: (val: any) => void) => void,
  next: (val: FEM<any, any>) => void,
) => void;
type K = (val: any) => any;
const last = (arr: any[]) => arr[arr.length - 1];
const minusLast = (arr: any[]) =>
  arr.length - 1 > 0 ? arr.slice(0, arr.length - 1) : [];
const findHandler = (key: PropertyKey, arr: any[]): HANDLER =>
  arr.length > 0
    ? last(arr)[key]
      ? last(arr)[key]
      : findHandler(key, minusLast(arr))
    : undefined;

const interpret = <R, Effects extends Effect>(
  program: FEM<R, Effects>,
  handlers: HANDLERS[] = [],
  next: (val: R) => void,
  // handlers: NoInfer<EffectsToKeys>
): void => {
  if (program.type === 'handle') {
    interpret(program.handle, [...handlers, program.handlers], next);
    return;
  } else if (program.type === 'chain') {
    const handler = findHandler(program.effect.name, handlers);
    if (!handler) {
      throw new Error('Handler not found for: ' + program.effect.name);
    }
    handler(
      program.effect.value,
      (val, _next) => void interpret(program.then(val), handlers, _next),
      // on done
      (res) => void interpret(res, minusLast(handlers), next),
      minusLast(handlers),
    );
    return;
  } else {
    next(program.value);
  }
  return;
};
// const main = Handle(
//   Handle(
//     Chain(Effect("plusOne", 1), (plusOne) =>
//       Chain(Effect("plusOne", 2), (p12) => {
//         return Chain(Effect("plusOne", 3), (p23) => {
//           return Pure("plusOne: " + plusOne + p12 + p23);
//         });
//       })
//     ),
//     {
//       plusOne(num, k, next, handlers) {
//         interpret(
//           Chain(Effect("name", "world"), (name) => Pure(name)),
//           handlers,
//           (name) => {
//             k(num + 1, (res) => {
//               // k(num + 2, (res2) => {
//               next(Pure(res + name));
//               // });
//             });
//           }
//         );
//       }
//     }
//   ),
//   {
//     name(name, k, next) {
//       k("Hello " + name, (res) => {
//         next(Pure(res));
//       });
//     }
//   }
// );
// interpret(main, [], console.log);

const main2 = Handle(
  Handle(
    Chain(Effect('test1', 'hi0'), (hi0) =>
      Chain(Effect('test0', 'hi1'), (hi1) =>
        Chain(Effect('test0', 'hi0'), (hi3) => Pure(hi0 + hi1 + hi3)),
      ),
    ),
    {
      test0(val, k, then) {
        k(val, (res) => {
          then(Pure('~' + res + '~'));
        });
      },
    },
  ),
  {
    test1(val, k, then) {
      k(val, (res) => {
        then(Pure('(' + res + ')'));
      });
    },
  },
);

interpret(main2, [], console.log);

function clonableIterator(it: (...args: any[]) => Generator, history = []) {
  return (...args: any[]) => {
    const gen = it(...args);
    history.forEach((v) => gen.next(v));
    return {
      next(arg: any) {
        history.push(arg as never);
        const res = gen.next(arg);
        return res;
      },
      clone() {
        return clonableIterator(it, [...history])(...args);
      },
      [Symbol.iterator]() {
        return this;
      },
    };
  };
}
type NoInfer<T> = [T][T extends any ? 0 : never];

// const main = Handle(
//   Handle(
//     Chain(Length("hi10"), (length) =>
//       Chain(PlusOne(length), (plusOne) => Pure(plusOne))
//     ),
//     {
//       plusOne(num, k, then) {
//         k(num + 1, (res1) => {
//           k(num + 2, (res2) => {
//             then(Pure("res1: " + res1 + " res2: " + res2));
//           });
//         });
//       }
//     }
//   ),
//   {
//     length(str, k, then) {
//       k(str.length, (val) => {
//         then(Pure(val));
//       });
//     }
//   }
// );

// interpret(main, [], (sla) => console.log("done", sla));

// const sla = Handle(Pure<number, Length>(0), {
//   // return(val) {
//   //   return val;
//   // },

//   length(str, v) {
//     const res = v(str.length);
//     return "done: " + res;
//   }
// });

// function interpretGenHandler(gen: Generator, v, onDone) {
//   // console.log(gen.clone());
//   const { value, done } = gen.next(v);
//   if (done) {
//     onDone(Pure(value));
//   }
// }

// const PAUSE = Effect("pause", undefined);

// function genHandler<R, R2>(
//   fn: (val: R, k: (val: any) => typeof PAUSE) => Generator<R2>
// ): HANDLER {
//   return (val, k, next) => {
//     const gen = fn(val, (resumeValue) => {
//       k(resumeValue, (th) =>
//         setTimeout(() => interpretGenHandler(gen, th, next), 0)
//       );
//       return PAUSE;
//     });
//     interpretGenHandler(gen, undefined, next);
//   };
// }

//todo tommorow: fix type async/multishot effects, cps style
function genToObjs<R, E extends Effect<any, any>>(
  fun: () => Generator<E, R, never>,
): FEM<R, E extends FEM<any, infer U> ? U : never> {
  const iterator = clonableIterator(fun)();
  const state = iterator.next(undefined);
  function run(
    state: IteratorYieldResult<E> | IteratorReturnResult<R>,
  ): FEM<R, any> {
    if (state.done) {
      return Pure(state.value);
    } else {
      const res = Chain(state.value, (val) => {
        const next = iterator.next(val as never); // typescript
        return run(next);
      });
      res.clone = genToObjs(iterator.clone);
      return res;
    }
  }
  return run(state);
}
const res = genToObjs(function* () {
  const plusOne = yield PlusOne(1);
  const length = yield Length('123');
  return [length, plusOne];
});

// interpret(
//   Handle(
//     Handle(res, {
//       plusOne: (num: number, k) =>
//         genToObjs(function* () {
//           const once = yield k(num + 1);
//           // const twice = yield k(num + 2);
//           return once;
//           // return "res1: " + once + " res2:" + twice;
//         })
//       // plusOne(num, k, then) {
//       //   k(num + 1, (res1) => {
//       //     k(num + 2, (res2) => {
//       //       then(Pure("res1: " + res1 + "res2:" + res2));
//       //     });
//       //   });
//       // }
//     }),
//     {
//       // length(str, k, then) {
//       //   k(str.length, (val) => {
//       //     then(Pure(val));
//       //   });
//       // }
//       length: (str: string, k) =>
//         genToObjs(function* () {
//           const res = yield k(str.length);
//           return res;
//           // return "owo";
//         })
//     }
//   ),
//   [],
//   (sla) => console.log("done", sla)
// );
