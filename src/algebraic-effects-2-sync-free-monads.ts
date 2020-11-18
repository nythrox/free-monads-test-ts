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
interface Handle<
  P extends PropertyKey,
  E extends Effect,
  E2 extends Effect,
  R,
  R2
> {
  type: "handle";
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
  handlers: GetScopedHandlers<P, E, E2, R, R2>
) => {
  return ({
    handle: program,
    handlers,
    type: "handle"
  } as any) as FEM<R2, E>;
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

type HANDLER = (
  val: any,
  k: (val: any, next: (val: any) => void) => void,
  next: (val: FEM<any, any>) => void
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
  next: (val: R) => void
  // handlers: NoInfer<EffectsToKeys>
): void => {
  if (program.type === "handle") {
    interpret(program.handle, [...handlers, program.handlers], next);
    return;
  } else if (program.type === "chain") {
    const handler = findHandler(program.effect.name, handlers);
    if (!handler) {
      throw new Error("Handler not found for: " + program.effect.name);
    }
    handler(
      program.effect.value,
      (val, _next) => void interpret(program.then(val), handlers, _next),
      // on done
      (res) => void interpret(res, minusLast(handlers), next),
      minusLast(handlers)
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
    Chain(Effect("test1", "hi0"), (hi0) =>
      Chain(Effect("test0", "hi1"), (hi1) =>
        Chain(Effect("test0", "hi0"), (hi3) => Pure(hi0 + hi1 + hi3))
      )
    ),
    {
      test0(val, k, then) {
        k(val, (res) => {
          then(Pure("~" + res + "~"));
        });
      }
    }
  ),
  {
    test1(val, k, then) {
      k(val, (res) => {
        then(Pure("(" + res + ")"));
      });
    }
  }
);

interpret(main2, [], console.log);
