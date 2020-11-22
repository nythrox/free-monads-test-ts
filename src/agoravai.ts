import {
    Effect,
    effect,
    handle,
    performEffect,
    done,
    Syntax,
    isDone,
    isEffectCall,
    isHandler,
    HandleEffect
  } from "./core";
  interface ConsoleLog extends Effect<"ConsoleLog", string, void> {}
  const ConsoleLog = (val: string) =>
    effect<"ConsoleLog", string, void>("ConsoleLog", val) as ConsoleLog;
  
  const program = handle(
    "ConsoleLog",
    performEffect(ConsoleLog("hello world"), () => done("printed hello world")),
    (e) => {
      return done([e]);
      // return done([e]) as Syntax<string[], ConsoleLog>;
    },
    (log, resume) => {
      console.log(log);
      // return performEffect(resume(), (res) =>
      //   performEffect(resume(), () => done([res + res]))
      // )
      // return performEffect(resume(), (res) => done(res));
      return done([log]);
    }
  );
  
  type then<R = any> = (val: R) => void;
  type HandlerList = [
    PropertyKey,
    HandleEffect<any, any, any>,
    (res: any, continueHandler: (val: any, afterHandler: then) => void) => void
  ][];
  const pop = <T>(a: T[]) => a.slice(0, a.length - 1);
  const last = <T>(a: T[]) => a[a.length - 1];
  const findHandler = (
    k: PropertyKey,
    a: HandlerList
  ): [HandlerList[number][1], HandlerList[number][2]] => {
    const l = last(a);
    if (!l) throw new Error("Handler not found");
    const [key, handler, next] = l;
    if (key === k) {
      return [handler, next];
    }
    return findHandler(k, a);
  };
  function runProgram<R>(
    program: Syntax<R, never>,
    then: then<R>,
    handlers: HandlerList = []
  ): void {
    if (isDone(program)) {
      then(program.value);
    } else if (isEffectCall(program)) {
      if (program.effect.key === "@@internal@@/resume") {
        const {
          program: handledProgram,
          gotHandlerValue,
          resumeValue
        } = program.effect.value;
        const resumed = handledProgram.callback(resumeValue);
        runProgram(resumed, (doneValue) => {
          gotHandlerValue(doneValue, (result, den) => {
            const res = program.callback(result);
            runProgram(res, den);
          });
        });
      } else {
        const effectCall = program;
        const [handler, gotHandlerValue] = findHandler(
          effectCall.effect.key,
          handlers
        );
        const syntax = handler(program.effect.value, (resumeValue) =>
          effect("@@internal@@/resume", { resumeValue, gotHandlerValue, program })
        );
        runProgram(syntax as any, then, pop(handlers));
      }
    } else if (isHandler(program)) {
      const onRes = (
        res: any,
        continueHandler: (val: any, afterHandler: then) => void
      ) => {
        const transformed = program.handleReturn(res);
        runProgram(
          transformed,
          (val) => continueHandler(val, then),
          pop(handlers)
        );
      };
      handlers.push([program.handleKey, program.handleEffect, onRes]);
      runProgram(
        program.handle as any,
        then /* will only be called directly if there are no effect calls */,
        handlers
      );
    } else
      throw Error(
        `Invalid instruction! Received: ${program} and expected an (Effect Call | Handler | Done).`
      );
  }
  
  runProgram(program, (res) => console.log("FINISHED RUNNING PROGRAM: ", res));
  