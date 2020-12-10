import {
  Effect,
  perform,
  handler,
  Action,
  of,
} from './MONADIC_algebraic_effects';
export interface Async<T> extends Effect<'async', Promise<T>, T> {}
export interface List<T> extends Effect<'list', Array<T>, T> {}

export const waitFor = <T>(promise: Promise<T>) =>
  perform<Async<T>>('async')(promise);
export const foreach = <T>(array: Array<T>) => perform<List<T>>('list')(array);

export const handlePromise = <
  R,
  PromiseVal,
  E extends Effect,
  A extends Action<R, Async<PromiseVal> | E>
>(
  action: A, // : Action<Promise<R>, E>
) =>
  handler<Async<PromiseVal>, R>()(
    {
      return: (res) => of(Promise.resolve(res)),
    },
    {
      async(value, exec, resume, then) {
        value.then((promiseVal) => {
          resume(promiseVal)(then);
        });
      },
    },
  )(action);

export const handleForeach = <
  R,
  Item,
  E extends Effect,
  A extends Action<R, List<Item> | E>
>(
  action: A, // : Action<Promise<R>, E>
) =>
  handler<List<Item>, R>()(
    {
      return: (res) => of([res]),
    },
    {
      list(value, exec, resume, then) {
        function flatmap(arr: any[], remaining: any[]) {
          const first = remaining[0];
          if (first) {
            resume(first)((res) => {
              flatmap(arr.concat(res), remaining.slice(1, remaining.length));
            });
          } else then(arr);
        }
        flatmap([], value);
      },
    },
  )(action);
