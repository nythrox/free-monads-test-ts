export {};

export function run<R>(gen: Generator<Next, R, any>, then: (value: R) => void) {
  function runGenerator(arg: any) {
    const { done, value: handler } = gen.next(arg);
    if (done) {
      then(handler as R);
    } else {
      // here we handle suspended computations
      (handler as Next)(function continuation(result: any) {
        runGenerator(result);
      });
    }
  }

  runGenerator(null);
}
// export function runGenerator<R>(
//   gen: Generator<Next, R, any>,
//   then: (value: R) => void,
//   arg: any = null,
// ) {
//   const { done, value: handler } = gen.next(arg) as any;
//   if (done) {
//     then(handler);
//   }
//   // here we handle suspended computations
//   handler(function continuation(result: any) {
//     runGenerator(gen, then, result);
//   });
// }

export type Next<T = any> = (arg: T) => void;
export type Handler<T> = (cont: Next<T>) => void;
export const gen = function* <T>(f: Handler<T>) {
  return (yield f) as T;
};
