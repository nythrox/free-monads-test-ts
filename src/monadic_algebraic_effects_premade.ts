import {
  handler,
  Effect,
  perform,
  of,
  Action,
} from './MONADIC_algebraic_effects';

interface Async<T> extends Effect<'async', Promise<T>, T> {}
interface List<T> extends Effect<'list', Array<T>, T> {}

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
        let newArray = [] as R[];
        let itemsProcessed = 0;

        value.forEach((item) => {
          resume(item)((result) => {
            itemsProcessed++;
            newArray = [...newArray, ...result];
            if (itemsProcessed === value.length) {
              then(newArray);
            }
          });
        });
      },
    },
  )(action);
