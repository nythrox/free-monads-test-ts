import { flow, pipe } from "./utils";
export interface Effect<K extends PropertyKey = any, V = any, R = any> {
  key: K;
  value: V;
  __return: R;
}

type Context<R> = {
  handlers: any[];
  prev: Context<any>;
  then: (val: R) => void;
};
interface Action<R, E extends Effect> {
  (context: Context<R>): void;
  [Symbol.iterator]: () => Iterator<Action<R, E>, R, any>;
}

const pop = (arr: any[]) => arr.slice(0, arr.length - 1);
const last = (arr: any[]) => arr[arr.length - 1];

const findHandler = (key: PropertyKey) => (arr: any[]): [any, any] => {
  const l = last(arr);
  if (!l) throw new Error("Handler not found: " + key.toString());
  if (l.handlers[key]) {
    return [l.handlers[key], l.context];
  }
  return findHandler(key)(pop(arr));
};
const withGen: <R, E extends Effect>(
  action: (context: Context<R>) => void
) => Action<R, E> = (action) => {
  (action as any)[Symbol.iterator] = function* () {
    return yield action;
  };
  return action as any;
};
const of = <R>(value: R): Action<R, never> =>
  withGen((context) => {
    context.then(value);
  });

const chain = <A, B, E1 extends Effect, E2 extends Effect>(
  chainer: (val: A) => Action<B, E1>
) => (effect: Action<A, E2>): Action<B, E1 | E2> =>
  withGen((context) => {
    effect({
      prev: context,
      handlers: context.handlers,
      then: (e) => {
        const eff2 = chainer(e);
        eff2(context);
      }
    });
  });
const run = <R>(effect: Action<R, never>, then: (val: R) => void) => {
  effect({
    prev: undefined as any,
    handlers: [],
    then
  });
};
const map = <A, A2, E extends Effect>(mapper: (val: A) => A2) => (
  effect: Action<A, E>
): Action<A2, E> => pipe(effect, chain(flow(mapper, of)));
const perform = <E extends Effect<any>>(key: PropertyKey) => <T>(
  value: T
): Action<E["__return"], E> =>
  withGen((context) => {
    const [handler, handlerCtx] = findHandler(key)(context.handlers);
    handler(
      value,
      // exec
      (eff: Action<any, any>) => (then: (val: any) => void) => {
        const effectCtx = {
          prev: handlerCtx,
          handlers: handlerCtx.prev.handlers,
          then
        };
        eff(effectCtx);
      },
      // k/resume
      (value: any) => (thenContinueHandler: (val: any) => void) => {
        //when the (return) transforming is done, call `thenContinueHandler`
        handlerCtx.prev.then = thenContinueHandler;
        context.then(value);
      },
      // instead of returning to parent, return to the handlers parent
      handlerCtx.prev.then
    );
  });
const handler = <HandleE extends Effect, R>() => <R2, E2 extends Effect>(
  ret: {
    return: (value: R) => Action<R2, E2>;
  },
  handlers: {
    [val in HandleE["key"]]: (
      value: HandleE["value"],
      exec: any,
      resume: (
        value: HandleE["__return"]
      ) => (next: (value: R2) => void) => void,
      then: (val: R2) => void
    ) => void;
  }
) => <E extends Effect>(program: Action<R, E>): Action<R2, E> =>
  withGen((context) => {
    const programBeingHandledCtx = {
      prev: context,
      handlers: (undefined as any) as any[],
      then: (val: any) => {
        // if (ret.return) {
        ret.return(val)(context);
        // } else of(val)(context);
      }
    };
    programBeingHandledCtx.handlers = [
      ...context.handlers,
      {
        handlers,
        context: programBeingHandledCtx
      }
    ];
    program(programBeingHandledCtx);
  });

const Effect = {
  do<
    A extends Action<any, any>,
    R,
    E extends Effect = A extends Action<any, infer Eff> ? Eff : never
  >(fun: () => Generator<A, R, any>): Action<R, E> {
    function run(history: any[]): Action<R, E> {
      const it = fun();
      let state = it.next();
      history.forEach((val) => {
        state = it.next(val);
      });
      if (state.done) {
        return of(state.value);
      }
      // return chain(state.value)((val) => {
      //   return run([...history, val]);
      // });
      return chain((val) => {
        return run([...history, val]);
      })(state.value);
    }
    return run([]);
  }
};

interface Async<T> extends Effect<"async", Promise<T>, T> {}
interface List<T> extends Effect<"list", Array<T>, T> {}

export const waitFor = <T>(promise: Promise<T>) =>
  perform<Async<T>>("async")(promise);
export const foreach = <T>(array: Array<T>) => perform<List<T>>("list")(array);

export const handlePromise = <
  R,
  PromiseVal,
  E extends Effect,
  A extends Action<R, Async<PromiseVal> | E>
>(
  action: A // : Action<Promise<R>, E>
) =>
  handler<Async<PromiseVal>, R>()(
    {
      return: (res) => of(Promise.resolve(res))
    },
    {
      async(value, exec, resume, then) {
        value.then((promiseVal) => {
          resume(promiseVal)(then);
        });
      }
    }
  )(action);

export const handleForeach = <
  R,
  Item,
  E extends Effect,
  A extends Action<R, List<Item> | E>
>(
  action: A // : Action<Promise<R>, E>
) =>
  handler<List<Item>, R>()(
    {
      return: (res) => of([res])
    },
    {
      list(value, exec, resume, then) {
        function flatmap(arr: any[], remaining: any[]) {
          const first = remaining[0];
          if (first) {
            resume(first)((res) => {
              flatmap(arr.concat(res), remaining.slice(1, remaining.length));
            });
          } else then(arr);
        }
        flatmap([], value);
      }
    }
  )(action);

const program = Effect.do(function* () {
  const num = yield* foreach([1, 2, 3, 4, 5]);
  const num2 = yield* foreach([1, 2]);
  const val = yield* waitFor(Promise.resolve(num * 2 * num2));
  return val;
});
const sla = handleForeach(program);

run(handleForeach(handlePromise(program)), (res) => {
  Promise.all(res).then(console.log);
});
