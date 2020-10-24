import { pipe } from './utils';
import { Any } from 'ts-toolbelt';
import {
  toFree,
  Free,
  Pure,
  EasyEffect,
  IsEffect,
  Chained,
  Handlers,
  free,
  doFree,
  raise,
  Exn,
} from './Free';

const handler = (eff: Chained) => {
  
}


const run = <B>(value: Free<any, B>) => async (
  handler: (val: Chained) => any | Promise<any>,
) => {
  const run_ = async (value: Free<any, B>): Promise<B> => {
    if (value instanceof Pure) {
      return value.value;
    }
    if (value instanceof Chained) {
      const result = await handler(value);
      return run_(value.next(result));
    }
    throw new Error('invaid argument, expected a free monad');
  };
  return run_(value);
};
const buildInterpreter = <Eff extends EasyEffect>(
  ifs: { [P in keyof Eff]: IsEffect<any, P> }, //TODO: IsEffect<Eff, P>
  handlers: Handlers<Eff>,
) => (val: Chained) => {
  for (const key in ifs) {
    if (ifs[key](val)) {
      return handlers[key](...(val.effRepr.args as any));
    }
  }
  throw new CustomError({
    message:
      'effect not handled symbol: ' +
      val.effRepr.symbol.toString() +
      ' args: ' +
      val.effRepr.args,
    details: val.effRepr,
  });
};
// const handle = <Eff, Ret, Ret2, Eff2>(
//   effect: Free<Eff, Ret>,
//   handler: any
// ): Free<Remove<Eff, Eff2>, Ret2> => {}
type Console = {
  ask: (msg: string) => string;
  write: (msg: string) => void;
};

const [ask, isAsk, handleAsk] = toFree<Console, 'ask'>();
const [write, isWrite, handleWrite] = toFree<Console, 'write'>();

type State<T> = {
  get(): T;
  put(value: T): void;
};

const GetState = Symbol('getState');
const PutState = Symbol('putState');

const get = <T>() => free<State<T>, T>(GetS);
const put = <T>(value: T) => free<State<T>, T>(GetS, value);

const runConsoleProgram = buildInterpreter<Console>(
  { ask: isAsk, write: isWrite },
  {
    ask(msg) {
      console.log('asking: ', msg);
      return 'jason';
    },
    write(msg) {
      console.log('writing:', msg);
      return;
    },
  },
);

const program = ask('what is your name?').chain((name) =>
  write('Hello, ' + name),
);

// run(runConsoleProgram)(program)
// expected output:
// asking: what is your name?
// Hello, jason
interface Async {}

const AsyncS = Symbol('Async');

const finish = <T>(promise: Promise<T>): Free<Async, T> =>
  free<Async, T>(AsyncS, promise);

const SyncS = Symbol('Sync');

const sync = <T>(promise: Promise<T>): Free<Async, T> =>
  free<Async, T>(SyncS, promise);

type LocalStorage<T = any> = {
  get: (key: string) => T;
  set: (key: string, value: T) => void;
};
type User = {
  name: string;
};
type UserSource = {
  getUser: (id: string) => User;
};
const GetS = Symbol('get');

const getLocalStorage = <T>(key: string) => free<LocalStorage<T>, T>(GetS, key);

const SetS = Symbol('set');
const Set = <T>(key: string, value: T): Free<LocalStorage<T>, void> =>
  free(SetS, key, value);

const [_get, _isGet] = toFree<LocalStorage, 'get'>();
const [setLocalStorage, isSet, handleSetLocalStorage] = toFree<
  LocalStorage,
  'set'
>();
const [getUser, isGetUser] = toFree<UserSource, 'getUser'>();
class CustomError extends Error {
  public details: any;
  constructor(public error: { message?: string; details?: any }) {
    super(error?.message);
    this.details = error?.details;
  }
}
// const runProgram2 = buildInterpreter<UserSource>(
//   { getUser: isGetUser },
//   {
//     async getUser(id) {
//       return {
//         name: 'jason' + id,
//       };
//     },
//   },
// );
const localStorage = {} as Record<string, any>;
const runProgram1 = buildInterpreter<Console & LocalStorage>(
  {
    ask: isAsk,
    write: isWrite,
    set: isSet,
    get: _isGet,
  },
  {
    ask(msg) {
      console.log('asking: ', msg);
      return 'jason';
    },
    write(msg) {
      console.log('writing: ', msg);
      return;
    },
    get(key) {
      console.log('getting: ', key);
      return localStorage[key];
    },
    set(key, val) {
      console.log('seting key value: ', key, val);
      localStorage[key] = val;
      return;
    },
  },
);

// const program2 = Return<Console>(5)
//   .chain((a) => Return(7))
//   .chain((b) => Return('10'))

describe('free', () => {
  // test.only('free test', async () => {
  //   const program3 = ask('whats ur name')
  //     .chain((name) => setLocalStorage('name', name))
  //     .chain(() => getLocalStorage('name'))
  //     .chain((name) => write('hello, ' + name).map(() => name));
  //   const handled = program3.handle(
  //     handleSetLocalStorage((key, value) => {
  //       localStorage[key] = value;
  //     }),
  //   );
  //   const result = await run(program3)(runProgram1);
  //   expect(result).toEqual('jason');
  // });

  test.only('async free', async () => {
    const program = doFree(function* () {
      const id = yield* ask('whats your id');
      const user = yield* getUser(id);
      yield* Set('user', user);
      yield* Set('hi', 10);
      const smh = yield* getLocalStorage<number>('hi');
      yield* write('yoooo');
      return yield* getLocalStorage<User>('user');
    });

    // const handled = program.handle(
    //   handleAsk((msg) => {
    //     console.log(msg);
    //     return 'whats your id';
    //   }),
    //   handleWrite((msg) => console.log(msg)),
    // );

    // const result = await run(handled)(() => {});

    // expect(result.name).toEqual('jason10');
  });
});

// const algumacoisa = <T>(id: string) =>
//   pipe(
//     getUser(id),
//     chain((user) => set('user,', user)),
//     chain(() => write('user saved')),
//     chain(() => getLocalStorage<User>('user')),
//     map((user) => 'done, user:' + user.name),
//     chain(() => raise<Error, T>(new Error('bad'))),
//     //   )
//   );

// const counter = (): Free<Console | State<number>, void> =>
//   doFree(function* () {
//     const i = yield* get<number>();
//     if (i <= 0) {
//       return;
//     } else {
//       yield* write('i: ' + i);
//       yield* put(i - 1);
//       yield* counter();
//     }
//   });

// const state = <T, R, OtherEffects>(
//   initialValue: T,
//   action: Free<State<T> | OtherEffects, R>,
// ): Free<OtherEffects, [T, R]> => {
//   let value = initialValue;
//   const res = action.handle(
//     handlePutState((val) => {
//       value = val;
//     }),
//     handleGetState(() => value),
//   );
//   return res.map((val) => [value, val]);
// };

// type StateVal<T> = T extends State<infer A> ? A : never;
// type HandlePutState = <T, Eff = Any.Cast<T, State<any>>>( // cast because this fn will only trigger if there is a State effect in it
//   handler: (val: StateVal<Eff>) => void,
// ) => ((args: any[], eff: T) => void) & {
//   symbol: symbol;
//   remove: State<any>;
// };
// declare const handlePutState: HandlePutState;
// type HandleGetState = <T>(
//   handler: () => StateVal<T>,
// ) => ((args: any[], eff: T) => StateVal<T>) & {
//   symbol: symbol;
//   remove: State<any>;
// };
// declare const handleGetState: HandleGetState;

// const sla = algumacoisa<number>('100').handle(handleExn((_err) => 10));

// type ExnVal<T> = T extends Exn<infer A, infer _B> ? A : never;
// type ExpectedErrRet<T> = T extends Exn<infer _A, infer B> ? B : never;

// type HandleExn = <T>(
//   val: (err: ExnVal<T>) => ExpectedErrRet<T>,
// ) => ((args: any[], eff: T) => ExpectedErrRet<T>) & {
//   symbol: symbol;
//   remove: Exn<any, any>;
// };
// declare const handleExn: HandleExn;
const chain = <Effect1, Effect2, A, B = any>(
  f: (a: A) => Free<Effect2, B>, // delay the infer U, so it can get the monads URI
) => (fa: Free<Effect1, A>): Free<Effect1 | Effect2, B> => {
  return fa.chain(f);
};

const map = <Effect1, A, B = any>(
  f: (a: A) => B, // delay the infer U, so it can get the monads URI
) => (fa: Free<Effect1, A>): Free<Effect1, B> => {
  return fa.map(f);
};
