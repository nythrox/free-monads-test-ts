export interface Effect<K extends PropertyKey = any, V = any, R = any> {
  key: K;
  value: V;
  __return: R;
}

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
      programThen: (val: V) => Syntax<any>;
    },
    T
  > {}

export interface Syntax<R, E extends Effect = never> {
  _R: R;
  _E: E;
}
export const done = <T>(value: T) =>
  (({ value, type: "done" } as any) as Syntax<T, never>);

export const handle = <
  A,
  T,
  E extends Effect,
  E2 extends Effect,
  E3 extends Effect
>(
  handleKey: E["key"],
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
  } as any) as Syntax<T, E2>);

export const performEffect = <E extends Effect, T, E2 extends Effect>(
  effect: E,
  programThen: (result: E["__return"]) => Syntax<T, E2>
) => (({ type: "effectCall", programThen, effect } as any) as Syntax<T, E>);

export const createEffect = <K extends PropertyKey, V, R>(key: K, value: V) =>
  ({
    key,
    value
  } as Effect<K, V, R>);

  export type then<R = any> = (val: R) => void;
  export type HandlerList = {
    key: PropertyKey;
    handler: HandleEffect<any, any, any>;
    returnTo: then;
    return: then;
  }[];
  const pop = <T>(a: T[]) => a.slice(0, a.length - 1);
  const last = <T>(a: T[]) => a[a.length - 1];
  const findHandler = (key: PropertyKey, a: HandlerList): HandlerList[number] => {
    const l = last(a);
    if (!l) throw new Error("Handler not found");
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
      return done([e]);
      // return done([e]) as Syntax<string[], ConsoleLog>;
    },
    (log, resume) => {
      return performEffect(resume(), (res) =>
        performEffect(resume(), (res2) => done([...res, ...res2]))
      );
      // return performEffect(resume(), (res) => done(res));
      // return done([log]);
    }
  );
  // run(program).then(console.log).catch(console.log);
  
  const dostuff = performEffect(createEffect("test0", "hi0"), (hi0) =>
    performEffect(createEffect("test0", "hi1"), (hi1) =>
      performEffect(createEffect("test1", "hi2"), (hi2) => done(hi0 + hi1 + hi2))
    )
  );
  const program2 = handle(
    "test1" as never,
    handle(
      "test0",
      dostuff,
      (e) => done(e),
      (val, resume) => {
        console.log("performed test0");
        return performEffect(resume(val), (res) => done("~" + res + "~"));
      }
    ),
    (e) => done(e),
    (val, resume) => {
      console.log("performed test1");
      return performEffect(resume(val), (res) => done("(" + res + ")"));
    }
  );
  
  run(program2).then(console.log).catch(console.log);
  // run(
  //   handle(
  //     "test1",
  //     dostuff,
  //     (a) => done(a),
  //     (val, resume) => performEffect(resume(val), (res) => done("~" + res + "~"))
  //   )
  // )
  // .then(console.log)
  // .catch(console.log);
  function run<R>(program: Syntax<R, never>): Promise<R> {
    let count = 0;
    function runProgram<R>(
      program: Syntax<R, any>,
      then: then<R>,
      handlers: HandlerList = []
    ): void {
      if (isDone(program)) {
        then(program.value);
      } else if (isEffectCall(program)) {
        const { effect, programThen } = program;
        const { key, value } = effect;
        if (key !== resumeKey) {
          const handlerFrame = findHandler(key, handlers);
          const handlerProgram = handlerFrame.handler(value, (value) =>
            createEffect(resumeKey, { handlerFrame, value, programThen })
          );
          // skip return transformer
          // const saved = handlerFrame.return;
          // handlerFrame.return = then
          runProgram(handlerProgram, handlerFrame.returnTo, handlers);
        } else {
          const { value } = effect as Resume<any, any>;
          const { programThen, handlerFrame, value: resumeValue } = value;
          handlerFrame.returnTo = (returnTransformValue) => {
            // run effect handler program
            // console.log("being called with", returnTransformValue);
            // then("abc");
            runProgram(program.programThen(returnTransformValue), then, handlers);
          };
          // console.log("--set returnTo");
          // programThen is actual program
          const programThenSyntax = programThen(resumeValue);
          // run actual program
          runProgram(programThenSyntax, handlerFrame.return, handlers);
        }
      } else if (isHandler(program)) {
        const { handleEffect, handleReturn, program: handleProgram } = program;
        const handlerFrame = {
          handler: handleEffect,
          returnTo: then,
          return: (val) => {
            // this value won't change, it's only here for sharing purposes
            runProgram(handleReturn(val), (transformResult) => {
              // console.log(
              //   "-getting returnTo",
              //   program.handleKey,
              //   "returning with",
              //   transformResult
              // );
              handlerFrame.returnTo(transformResult);
            });
          },
          key: program.handleKey
        };
        runProgram(
          handleProgram,
          (e) => handlerFrame.return(e), // then will only be called here if the next program is a Handler or Pure
          // (done) => {
          //   runProgram(handleReturn(done), handlerFrame.then);
          // },
          [...handlers, handlerFrame]
        );
      } else
        throw Error(
          `Invalid instruction! Received: ${program} and expected an (Effect Call | Handler | Done).`
        );
    }
    return new Promise((resolve, reject) => {
      try {
        runProgram(program, resolve, []);
      } catch (e) {
        // handler not found
        reject(e);
      }
    });
  }
  
  // run(program)
  //   .then((res) => console.log("FINISHED RUNNING PROGRAM: ", res))
  //   .catch(console.log);
  