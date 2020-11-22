type Effect<K extends PropertyKey = any, V = any, R = any> = {
    key: K;
    value: V;
    __return: R;
  };
  type EffectCall<R, E extends Effect, E2 extends Effect = never> = {
    effect: E;
    callback: (result: E["__return"]) => Syntax<R, E2>;
    type: "effectCall";
  };
  type Done<R> = {
    value: R;
    type: "done";
  };
  // goes from A to R
  type Handler<R, E extends Effect, A = any, E2 extends Effect = never> = {
    handle: Syntax<A, E>;
    handlers: Handlers<R, A, E, E2>;
    type: "handler";
  };
  type Handlers<R, A, E extends Effect, E2 extends Effect = never> = {
    return: (value: A) => Syntax<R, E2> | Syntax<R, never>; // hack to make 'any is not assignable to never' work. (never is not assignable to Effect<any,any,any>)
  } & {
    [P in E["key"]]: (
      value: E["value"],
      resume: Resume<E["__return"], R>
    ) => Syntax<R, E2> | Syntax<R, never>;
  };
  
  interface Resume<V, T> extends Effect<"@@internal@@/resume", V, T> {}
  
  type Syntax<R, E extends Effect = never> =
    | EffectCall<R, E>
    | Handler<R, E>
    | Done<R>;
  const done = <T>(value: T) => ({ value, type: "done" } as Syntax<T, never>);
  
  const handle = <A, E extends Effect, E2 extends Effect>(
    handle: Syntax<A, E>
  ) => <T>(handlers: Handlers<T, A, E, any>) =>
    (({ type: "handler", handlers, handle } as any) as [
      Syntax<T, E2>,
      typeof handlers extends Handlers<infer _A, infer _B, infer _C, infer _E2>
        ? E2
        : never
    ]);
  
  const performEffect = <E extends Effect>(effect: E) => <T, E2 extends Effect>(
    callback: (result: E["__return"]) => Syntax<T, E2>
  ) => ({ type: "effectCall", callback, effect } as Syntax<T, E>);
  
  const effect = <K extends PropertyKey, V, R>(key: K) => (value: V) =>
    ({
      key,
      value
    } as Effect<K, V, R>);
  interface ConsoleLog extends Effect<"ConsoleLog", string, void> {}
  const ConsoleLog: (val: string) => ConsoleLog = effect<
    "ConsoleLog",
    string,
    void
  >("ConsoleLog");
  const program = handle(
    performEffect(ConsoleLog("hello world"))(() => done("printed hello world"))
  )({
    return(e) {
      // return done([e]);
      return done([e]) as Syntax<string[], ConsoleLog>;
    },
    ConsoleLog(log) {
      return done([log]);
    }
  });
  