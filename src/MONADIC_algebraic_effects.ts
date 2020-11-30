import { flow, pipe } from "./utils";
type Perform<R> = {
  key: PropertyKey;
  value: any;
  type: "perform";
  ___willReturn: R;
};

type Done<R> = {
  value: R;
  type: "done";
};

type Handle<R> = {
  handlers: Record<string, any>;
  program: Effect<R>;
  type: "handle";
};

type Syntax<R> = Perform<R> | Done<R> | Handle<R>;

const done = <R>(value: R) => ({ type: "done", value } as Syntax<R>);
type Context<R> = {
  handlers: any[];
  prev: Context<any>;
  then: (val: R) => void;
};
type Effect<R> = (context: Context<R>) => void;

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

const of = <R>(value: R): Effect<R> => (context) => {
  const syntax = done(value) as Done<R>;
  context.then(syntax.value);
};

const chain = <A, B>(chainer: (val: A) => Effect<B>) => (
  effect: Effect<A>
): Effect<B> => (context) => {
  effect({
    prev: context,
    handlers: context.handlers,
    then: (e) => {
      const eff2 = chainer(e);
      eff2(context);
    }
  });
};
const run = <R>(effect: Effect<R>, then: (val: R) => void) => {
  effect({
    prev: undefined as any,
    handlers: [],
    then
  });
};
const map = <A, A2>(mapper: (val: A) => A2) => (
  effect: Effect<A>
): Effect<A2> => pipe(effect, chain(flow(mapper, of)));
const perform = <R>(key: PropertyKey) => <T>(value: T) =>
  ((context) => {
    const [handler, handlerCtx] = findHandler(key)(context.handlers);
    handler(
      value,
      // exec
      (eff: Effect<any>) => (then: (val: any) => void) => {
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
  }) as Effect<R>;

const handler = (handlers: Record<PropertyKey, any>) => <R>(
  program: Effect<R>
) =>
  ((context) => {
    const programBeingHandledCtx = {
      prev: context,
      handlers: (undefined as any) as any[],
      then: (val) => {
        if (handlers.return) {
          handlers.return(val)(context);
        } else of(val)(context);
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
  }) as Effect<R>;
  
const Effect = {
  do<R>(fun: () => Generator<Effect<any>, R, any>) {
    function run(history: any[]): Effect<R> {
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
const test0 = perform("test0");
const test1 = perform("test1");

const dostuff = Effect.do(function* () {
  const hi0 = yield test1("hi0");
  const hi1 = yield test1("hi1");
  const hi2 = yield test0("hi2");
  const hi3 = yield test0("hi3");
  return hi0 + hi1 + hi2 + hi3;
});

const handleTest0 = handler({
  return(val) {
    return of(val + ".t0");
  },
  test0(val, exec, resume, then) {
    resume(val)((res) => {
      then("~" + res + "~");
    });
  }
});

const handleTest1 = handler({
  return(val) {
    return of(val + ".t1");
  },
  test1(val, exec, resume, then) {
    resume(val)((res) => {
      then("(" + res + ")");
    });
  }
});

const program = run(handleTest1(handleTest0(dostuff)), console.log);
