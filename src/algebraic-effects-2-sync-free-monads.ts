interface Effect<P extends PropertyKey = any, T = any, R = any> {
    name: P;
    value: T;
    ___willReturn: R;
  }
  
  interface Pure<R> {
    value: R;
    type: "pure";
  }
  interface Chain<R, E extends Effect> {
    effect: E;
    type: "chain";
    then: (val: E["___willReturn"]) => FEM<R, E>;
  }
  
  type FEM<R, E extends Effect = never> = Chain<R, E> | Pure<R>;
  const Chain = <E extends Effect, R, E2 extends Effect>(
    effect: E,
    then: (val: E["___willReturn"]) => FEM<R, E2>
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
  
  const main = Chain(Length("helloworld"), (length) =>
    Chain(PlusOne(length), (plusOne) => Pure(plusOne))
  );
  
  type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
    k: infer I
  ) => void
    ? I
    : never;
  const DONE = Symbol();
  const interpret = <
    R,
    Effects extends Effect,
    Keys extends PropertyKey = Effects["name"],
    EffectsToKeys extends Record<PropertyKey, (val: any) => any> = {
      [Key in Keys]: Effects extends Effect<infer K, infer V, infer R>
        ? K extends Key
          ? (val: V) => R
          : never
        : never;
    }
  >(
    program: FEM<R, Effects> | typeof DONE,
    handlers: NoInfer<EffectsToKeys>
  ) => {
    let done!: R;
    while (program !== DONE) {
      if (program.type === "chain") {
        const continueWithValue = handlers[program.effect.name](
          program.effect.value
        );
        program = program.then(continueWithValue);
        continue;
      }
      if (program.type === "pure") {
        done = (program as Pure<any>).value;
        program = DONE;
      }
    }
    return done;
  };
  
  type NoInfer<T> = [T][T extends any ? 0 : never];
  
  const sla = interpret(main, {
    plusOne(num) {
      return num + 1;
    },
    length(str) {
      return str.length;
    }
  });
  console.log("done", sla);
  
  type GetValue<Effects extends Effect, Key extends PropertyKey> = Extract<
    Effects["name"],
    Key
  > extends Effect<infer P, infer T, infer Ret>
    ? T
    : never;
  type GetReturn<Effects extends Effect, Key extends PropertyKey> = Extract<
    Effects["name"],
    Key
  > extends Effect<infer P, infer T, infer Ret>
    ? Ret
    : never;
  // type Filter<T, F> = T extends F ? T : never;
  // type hoi<T, F> = [T] extends [F] ? F : never;
  // type test = hoi<{ hi: number }, { owo: string }>;
  