/* eslint-disable */
export interface Effect<K extends PropertyKey = any, V = any, R = any> {
  key: K;
  value: V;
  __return: R;
}

let count = 0;

export interface EffectCall<R, E extends Effect, E2 extends Effect = never>
  extends Syntax<R, E> {
  _R: R;
  _E: E;
  effect: E;
  programThen: (result: E["__return"]) => Syntax<R, E2>;
  type: "effectCall";
}

export function isEffectCall(val: any): val is EffectCall<any, any> {
  return val.type === "effectCall";
}

export interface Done<R, E extends Effect> extends Syntax<R, E> {
  _R: R;
  _E: E;
  value: R;
  type: "done";
}

export function isDone(val: any): val is Done<any, any> {
  return val.type === "done";
}
// goes from A to R
export interface Handler<
  R,
  E extends Effect,
  A,
  E2 extends Effect = never,
  E3 extends Effect = never
> extends Syntax<R, E> {
  _R: R;
  _E: E;
  handleKey: E["key"];
  program: Syntax<A, E>;
  handleReturn: HandleReturn<A, R, E2>;
  handleEffect: HandleEffect<E, R, E3>;
  type: "handler";
}
export type HandleReturn<A, R, E extends Effect> = (val: A) => Syntax<R, E>;
export type HandleEffect<E extends Effect, R, E2 extends Effect> = (
  val: E["value"],
  resume: (val: E["__return"]) => Resume<E["__return"], R>
) => Syntax<R, E2>;
export function isHandler(val: any): val is Handler<any, any, any> {
  return val.type === "handler";
}

export const resumeKey = Symbol("@@internal@@/resume");
export type NoInfer<T> = [T][T extends any ? 0 : never];
export interface Resume<V, T>
  extends Effect<
    typeof resumeKey,
    {
      handlerFrame: HandlerList[number];
      value: V;
      mainProgram: EffectCall<any, any, any>;
    },
    T
  > {}

export interface Syntax<R, E extends Effect = never> {
  _R: R;
  _E: E;
  prev: Syntax<any, any>;
  _return: (val: R) => void;
}
export const done = <T>(value: T) =>
  (({ value, type: "done" } as any) as Syntax<T, never>);

export type Remove<
  T extends Effect,
  RemoveValue extends PropertyKey
> = T extends Effect<RemoveValue> ? never : T;

export const handle = <
  A,
  T,
  E extends Effect,
  SLA extends PropertyKey = Effect["key"],
  P extends SLA = any,
  E2 extends Effect = any,
  E3 extends Effect = any
>(
  handleKey: P,
  program: Syntax<A, E>,
  handleReturn: HandleReturn<A, T, E2>,
  handleEffect: HandleEffect<E, T, E3>
) =>
  (({
    handleKey,
    type: "handler",
    handleReturn,
    handleEffect,
    program
  } as any) as Syntax<T, Remove<E, P> | E2 | Remove<E3, typeof resumeKey>>);

export const performEffect = <E extends Effect, T, E2 extends Effect>(
  effect: E,
  programThen: (result: E["__return"]) => Syntax<T, E2>
) =>
  (({ type: "effectCall", programThen, effect } as any) as Syntax<T, E | E2>);

export const createEffect = <K extends PropertyKey, V, R>(key: K, value: V) =>
  ({
    key,
    value
  } as Effect<K, V, R>);

export type then<R = any> = (val: R) => void;
export type HandlerList = {
  key: PropertyKey;
  handler: HandleEffect<any, any, any>;
  program: Syntax<any, any>;
}[];
const pop = <T>(a: T[]) => a.slice(0, a.length - 1);
const last = <T>(a: T[]) => a[a.length - 1];
const findHandler = (key: PropertyKey, a: HandlerList): HandlerList[number] => {
  const l = last(a);
  if (!l) throw new Error("Handler not found: " + key.toString());
  if (key === l.key) {
    return l;
  }
  return findHandler(key, pop(a));
};
interface ConsoleLog extends Effect<"ConsoleLog", string, void> {}
const ConsoleLog = (val: string) =>
  createEffect<"ConsoleLog", string, void>("ConsoleLog", val) as ConsoleLog;
const per = performEffect(ConsoleLog("hello world"), () =>
  done("printed hello world")
);
const dndper = done("didnt print hello world");
const program = handle(
  "ConsoleLog",
  per,
  (e) => {
    return done([e + "!!"]);
    // return done([e]) as Syntax<string[], ConsoleLog>;
  },
  (log, resume) => {
    // return performEffect(resume(), (res) => {
    //   console.log("hey!");
    //   return performEffect(resume(), (res2) => {
    //     console.log("hey2");
    //     return done([...res, ...res2]);
    //   });
    // });
    // return performEffect(resume(), (res) => done(res));
    return done([log]);
  }
);
// run(program).then(console.log).catch(console.log);
const test0 = (msg: string) =>
  createEffect<"test0", string, string>("test0", msg);
const test1 = (msg: string) =>
  createEffect<"test1", string, string>("test1", msg);

const dostuff = performEffect(test0("hi0"), (hi0) =>
  performEffect(test0("hi1"), (hi1) =>
    performEffect(test1("hi2"), (hi2) =>
      performEffect(test1("hi3"), (hi3) => done(hi0 + hi1 + hi2 + hi3))
    )
  )
);
const program2 = handle(
  "test1",
  handle(
    "test0",
    dostuff,
    (e) => done(e + "transformed0"),
    (val, resume) => {
      // return performEffect(createEffect("test1", "hi3"), (res1) =>
      //   performEffect(resume(val), (res) =>
      //     done("~" + "[" + res1 + "]" + res + "~")
      //   )
      // );
      return performEffect(resume(val), (res) => done("~" + res + "~"));
    }
  ),
  (e) => done(e + "transformed1"),
  (val, resume) => {
    // return performEffect(createEffect("test0", "hi3"), (res1) =>
    //   performEffect(resume(val), (res) =>
    //     done("~" + "[" + res1 + "]" + res + "~")
    //   )
    // );
    return performEffect(resume(val), (res) => done("(" + res + ")"));
  }
);

run(program2).then(console.log).catch(console.log);

const singleprogrammulti = handle(
  "smh",
  performEffect(createEffect("smh", "hi"), (res) => done(res + " done")),
  (val) => done("(r " + val + " r)"),
  (val, resume) =>
    performEffect(resume(val), (res1) =>
      performEffect(resume(val), (res2) =>
        performEffect(resume(val), (res3) =>
          done(res1 + res2 + res3 + " resumed! :)")
        )
      )
    )
);

// run(singleprogrammulti).then(console.log).catch(console.log);

// run(done(5)).then(console.log).catch(console.log);

function printNotovflr(value: any) {
  count++;
  if (count < 100) {
    // console.log("log", value);
    return true;
  }
  return false;
}

function run<R>(program: Syntax<R, never>): Promise<R> {
  function runProgram<R>(
    program: Syntax<R, any>,
    handlers: HandlerList = []
  ): void {
    if (isDone(program)) {
      handleDone(program, handlers);
    } else if (isHandler(program)) {
      handleHandler(program, handlers);
    } else if (isEffectCall(program)) {
      if (program.effect.key !== resumeKey) {
        handleEffectCall(program, handlers);
      } else {
        handleResumeEffect(program, handlers);
      }
    } else
      throw Error(
        `Invalid instruction! Received: ${program} and expected an (Effect Call | Handler | Done).`
      );
  }
  function handleDone(program: Done<any, any>, handlers: HandlerList = []) {
    if (printNotovflr(program.value)) {
      // console.log("calling done from actually done", program.value);
      program._return(program.value);
      // then(program.value);
    } else {
      console.log("!!!!!!overflow!!!!!!");
    }
  }
  function handleHandler(
    program: Handler<any, any, any, any>,
    handlers: HandlerList = []
  ) {
    const { handleEffect, handleReturn, program: handleProgram } = program;
    const handlerFrame = {
      handler: handleEffect,
      key: program.handleKey,
      program: handleProgram
    };
    handleProgram.prev = program;
    handleProgram._return = (e) => {
      const transformedSyntax = handleReturn(e);
      transformedSyntax.prev = handleProgram.prev;
      transformedSyntax._return = handleProgram.prev._return;
      runProgram(transformedSyntax, handlers);
    };
    runProgram(handleProgram, [...handlers, handlerFrame]);
  }

  function handleEffectCall(
    program: EffectCall<any, any, never>,
    handlers: HandlerList = []
  ) {
    const { effect } = program;
    const { key, value } = effect;
    const handlerFrame = findHandler(key, handlers);
    const activatedHandlerProgram = handlerFrame.handler(value, (value) =>
      createEffect(resumeKey, {
        handlerFrame,
        value,
        mainProgram: program
      })
    );
    activatedHandlerProgram.prev = handlerFrame.program.prev;
    activatedHandlerProgram._return = activatedHandlerProgram.prev._return;
    runProgram(activatedHandlerProgram, handlers);
  }
  function handleResumeEffect(
    program: EffectCall<any, Resume<any, any>, never>,
    handlers: HandlerList = []
  ) {
    // program being passed is EffectCall(resumeProgram, { mainProgram, activatedHandlerProgram, handlerFrame })
    const { effect } = program;
    const { value } = effect;
    const { handlerFrame, value: resumeValue, mainProgram } = value;
    handlerFrame.program.prev = {
      _return(transformedVal) {
        const continueHandler = program.programThen(transformedVal);
        continueHandler.prev = program;
        continueHandler._return = continueHandler.prev._return;
        runProgram(continueHandler, handlers);
      }
    } as Syntax<any, any>;
    const continueMain = mainProgram.programThen(resumeValue);
    continueMain.prev = mainProgram;
    continueMain._return = mainProgram._return;
    runProgram(continueMain, handlers);
  }
  return new Promise((resolve, reject) => {
    try {
      program._return = resolve;
      runProgram(program, []);
    } catch (e) {
      // handler not found
      reject(e);
    }
  });
}

// run(program)
//   .then((res) => console.log("FINISHED RUNNING PROGRAM: ", res))
//   .catch(console.log);
