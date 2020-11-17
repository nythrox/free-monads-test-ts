interface Effect<P extends PropertyKey = any, V = any, R = any> {
  name: P;
  value: V;
  __returnWith: R;
}

interface Pure<R> {
  value: R;
  type: "pure";
}
interface Chain<R, E extends Effect> {
  effect: E;
  type: "chain";
  then: (val: E["__returnWith"]) => FEM<R, E>;
}
interface Handle<P extends PropertyKey, E extends Effect, R, R2> {
  type: "handle";
  handlers: GetScopedHandlers<P, E, R, R2>;
  handle: FEM<R>;
}
type GetScopedHandlers<P extends PropertyKey, E extends Effect, R, R2> = {
  // return: (val: R) => R2;
} & { [val in P]: (val: E["value"], k: (val: E["__returnWith"]) => R) => R2 };

const Handle = <P extends PropertyKey, E extends Effect, R, R2>(
  program: FEM<R, E>,
  handlers: GetScopedHandlers<P, E, R, R2>
) => {
  return ({
    handle: program,
    handlers,
    type: "handle"
  } as any) as FEM<R2, E>;
};
type Add<P extends PropertyKey, V> = {
  [val in P]: V;
};

type FEM<R, E extends Effect> = Chain<R, E> | Pure<R> | Handle<any, E, R, R>;
const Chain = <E extends Effect, R, E2 extends Effect>(
  effect: E,
  then: (val: E["__returnWith"]) => FEM<R, E2>
) =>
  ({
    effect,
    then,
    type: "chain"
  } as FEM<R, E | E2>);
const Pure = <R, E = never>(value: R) => ({ value, type: "pure" } as FEM<R, E>);
const Effect = <P extends PropertyKey, T, R>(name: P, value: T) =>
  ({ name, value } as Effect<P, T, R>);
interface Length extends Effect<"length", string, number> {}
const Length = (string: string) => Effect("length", string) as Length;
interface PlusOne extends Effect<"plusOne", number, number> {}
const PlusOne = (num: number) => Effect("plusOne", num) as PlusOne;

type GetHandlers<
  Effects extends Effect,
  Keys extends PropertyKey = Effects["name"]
> = {
  [Key in Keys]: Effects extends Effect<infer K, infer V, infer R>
    ? K extends Key
      ? (val: V) => R
      : never
    : never;
};
type HANDLERS = Record<PropertyKey, HANDLER>;
type HANDLER = (val: any, k: K) => any;
type K = (val: any) => any;
const last = (arr: any[]) => arr[arr.length - 1];
const findHandler = (key: PropertyKey, arr: any[]): HANDLERS =>
  arr.length > 0
    ? last(arr)[key]
      ? last(arr)[key]
      : findHandler(key, arr.length - 1 > 0 ? arr.slice(0, arr.length - 1) : [])
    : undefined;
const interpret = <R, Effects extends Effect>(
  program: FEM<R, Effects>,
  handlers: HANDLERS[] = []
  // handlers: NoInfer<EffectsToKeys>
): R => {
  if (program.type === "handle") {
    return interpret(program.handle, [...handlers, program.handlers]);
  }
  if (program.type === "chain") {
    const handler = findHandler(program.effect.name, handlers);
    console.log(handler);
    if (!handler) {
      throw new Error("Handler not found for: " + program.effect.name);
    }
    return handler(program.effect.value, (val) =>
      interpret(program.then(val), handlers)
    );
  } else return program.value;

  // let handlers: HANDLERS = {};
  // let done!: R;
  // while (program !== DONE) {
  //   if (program.type === "chain") {
  //     const handler = handlers[program.effect.name];
  //     if (!handler) {
  //       throw new Error("Handler not found for: " + program.effect.name);
  //     }
  //     const continueWithValue = handler(program.effect.value);
  //     program = program.then(continueWithValue);
  //     continue;
  //   }
  //   if (program.type === "pure") {
  //     done = (program as Pure<any>).value;
  //     program = DONE;
  //   }
  // }
  // return done;
};

type NoInfer<T> = [T][T extends any ? 0 : never];

const main = Handle(
  Handle(
    Chain(Length("hi"), (length) =>
      Chain(PlusOne(length), (plusOne) => Pure(plusOne))
    ),
    {
      plusOne(num, k) {
        return k(num + 1);
      }
    }
  ),
  {
    length(str, k) {
      return k(str.length);
    }
  }
);

const sla = interpret(main);
console.log("done", sla);

const sla = Handle(Pure<number, Length>(0), {
  // return(val) {
  //   return val;
  // },

  length(str, v) {
    const res = v(str.length);
    return "done: " + res;
  }
});
