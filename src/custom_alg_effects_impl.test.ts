// import { handle, perform } from './custom_alg_effects_impl';
// import { Remove } from './effects.test';
// import { UnionToTuple } from './helpers';

// export interface Eff<A, E> extends Generator<E, A> {}

// type fn = (...args: any[]) => any;

// type Handler<
//   T extends Record<string, fn>,
//   Arr extends readonly (keyof T)[],
//   A,
//   E,
//   R,
//   E2
// > = { return?: (val: A) => Eff<R, E2> } & {
//   [P in Arr[number]]?: (
//     ...args: [...Parameters<T[P]>, (val: ReturnType<T[P]>) => Eff<A, E>]
//   ) => Eff<R, E2>;
// };

// const deriveEffects = <T extends Record<string, fn>>() => <Name extends string>(
//   key: Name,
// ) => <Arr extends readonly (keyof T)[]>(
//   ...names: Arr
// ): [
//   ExtractReturn<T, Arr>,
//   <A, E, R, E2>(
//     e: Eff<A, E>,
//     handlers: Handler<T, Arr, A, E, R, E2>,
//   ) => Eff<R, Remove<E | E2, T>>,
// ] => {
//   const fns: any = {};
//   names.forEach((name) => {
//     fns[name] = (...args: any[]) =>
//       perform(key, {
//         key: name,
//         args: args,
//       });
//   });
//   return [
//     fns,
//     (e, handlers) => {
//       return handle(e, {
//         return: handlers['return'],
//         *[key](val: { key: string; args: any[] }, k) {
//           return yield* handlers[val.key](...val.args, k);
//         },
//       }) as any;
//     },
//   ];
// };
// type ExtractReturn<
//   T extends Record<string, fn>,
//   A extends readonly (keyof T)[]
// > = {
//   [P in A[number]]: (...args: Parameters<T[P]>) => Eff<ReturnType<T[P]>, T>;
// };

// type User = {
//   name: string;
//   id: string;
// };
// type UserService = {
//   findOne(id: string): User;
//   findAll(): User[];
//   deleteOne(id: string): User;
//   save(id: string, name: string): string;
// };
// interface Book {
//   id: string;
//   year: string;
// }
// type BookService = {
//   findAll(): Book[];
// };
// const [BookService, withBookService] = deriveEffects<BookService>()(
//   'BookService',
// )('findAll');
// const [UserService, withUserService] = deriveEffects<UserService>()(
//   'UserService',
// )('deleteOne', 'findAll', 'findOne', 'save');

// interface List<T> {
//   readonly list: unique symbol;
//   ____val: T;
// }
// const arr = <T>(list: T[]) => perform<List<T>, T>('list', list);

// function* main(id: string) {
//   const users = yield* UserService.findAll();
//   const user = yield* arr(users);
//   yield* UserService.deleteOne(user.id);
//   return yield* UserService.findOne(user.id);
// }
// // todo: how does each handler relate to eachother
// // todo: return type of yield* k() is lying to us (it's A | R not A)
// const res = withUserService(main('10'), {
//   *return(a) {
//     return yield* BookService.findAll()
//   },
//   *findAll(k) {
//     yield* k([]);
//     return yield* BookService.findAll();
//   },
//   *findOne(userId, k) {
//     const res = yield* k({ name: 'jason', id: userId });
//     return yield* BookService.findAll();
//   },
// });
