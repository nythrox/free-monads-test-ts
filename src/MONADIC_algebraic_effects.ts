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
    console.log("yielding", action);
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
    return: (value: HandleE["value"]) => Action<R2, E2>;
  },
  handlers: {
    [val in HandleE["key"]]: (
      value: HandleE["value"],
      exec: any,
      resume: (
        value: HandleE["__return"]
      ) => (next: (value: R) => void) => void,
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
  do<R, E extends Effect>(
    fun: () => Generator<Action<any, E>, R, any>
  ): Action<R, E> {
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

interface Test0 extends Effect<"test0", string, string> {}
interface Test1 extends Effect<"test1", string, string> {}
const test0 = perform<Test0>("test0");
const test1 = perform<Test1>("test1");

const dostuff = Effect.do(function* () {
  const hi0 = yield* test1("hi0");
  const hi1 = yield* test1("hi1");
  const hi2 = yield* test0("hi2");
  const hi3 = yield* test0("hi3");
  return hi0 + hi1 + hi2 + hi3;
});

const handleTest0 = handler<Test0, string>()(
  { return: (val) => of(val + ".t0") },
  {
    test0(val, exec, resume, then) {
      resume(val)((res) => {
        then("~" + res + "~");
      });
    }
  }
);

const handleTest1 = handler<Test1, string>()(
  {
    return: (val) => of(val + ".t1")
  },
  {
    test1(val, exec, resume, then) {
      resume(val)((res) => {
        then("(" + res + ")");
      });
    }
  }
);

const program = run(handleTest1(handleTest0(dostuff)), console.log);
