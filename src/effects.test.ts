import {
  GEN,
  OP,
  op,
  resume,
  start,
  toGenStar,
  withHandler,
} from './algebraic-effects';
interface Log extends OP<void, 'log', { args: any[]; method: 'log' }> {}
interface StateGet<T> extends OP<T, 'state', { method: 'get' }> {}
interface StateSet<T> extends OP<void, 'state', { value: T; method: 'set' }> {}
interface Wait<T extends number> extends OP<T, 'wait', { milliseconds: T }> {}
interface Async<T> extends OP<T, 'resolve', { promise: Promise<T> }> {}
interface Amb extends OP<any, 'list', { list: Amb }> {}
// todo:
/**
 
    - transform all effects into a map { state: _, wait: _, log: _ }
      that way you can have type-safe effect handlers

    - add *extra effects* on the handlers type signature without having to be specified

  
 
    note: there is ways to discover the extra env being added, but not ways to discover whats being removed
 
 */

export function log(...args: any[]) {
  return op<Log>('log', { args, method: 'log' });
}
export function get<T>() {
  return op<StateGet<T>>('state', { method: 'get' });
}
export function set<T>(value: T) {
  return op<StateSet<T>>('state', { value, method: 'set' });
}
export function wait<T extends number>(milliseconds: T) {
  return op<Wait<T>>('wait', { milliseconds });
}

export function resolve<T>(promise: Promise<T>) {
  return op<Async<T>>('resolve', { promise });
}

function* main() {
  yield* printABC();
  yield* log('Bye');
  return 20;
}

function* printABC() {
  yield* log('A');
  yield* log('B');
  yield* log('C');
  return 10;
}

function* mainState() {
  const name = yield* get<string>();
  yield* log('name:', name);
  yield* set('jason');
  yield* log('name: ', name);
  const newname = yield* get<string>();
  return newname;
}
const numberPromise = Promise.resolve(10);
const transform = <E, A>(_g: GEN<E, A>) => (0 as any) as GEN<Foo<E>, A>;
const sla = transform(mainWait());
// first filter it, then transform it back into Wait
type Foo<T> = [T extends Wait<infer Z> ? Z : never] extends [infer U]
  ? [U] extends [number]
    ? Wait<U> | Remove<T, Wait<any>>
    : never
  : never;
// type Foo<T> = [T] extends [Wait<infer Z>] ? Wait<Z> | Remove<T, Wait<any>>: never

function* mainWait() {
  yield* log('stated waiting...');
  yield* wait(500);
  yield* wait(1000);
  yield* log('finished waiting');
  const res = yield* state('not_jason', mainState());
  yield* log('res: ', res);
  const number = yield* resolve(numberPromise);
  return 10 + number;
}
function* logTest() {
  yield* log('A');
  yield* log('B');
  yield* log('C');
}
function* test2() {
  // yield* perform("exn", "Nooo!");
  const plusOne = yield* op('plusOne', 1);
  const p12 = yield* op('plusOne', 2);
  const p23 = yield* op('plusOne', 3);
  return 'plusOne: ' + plusOne + p12 + p23;
}

function* test() {
  // const msg = yield* perform("name", "world");
  const number = yield* withHandler(test2(), {
    *plusOne(num, k) {
      const name = yield* op('name', 'world');
      const res = yield* k(num + 1);
      return res + name;
    },
  });
  return number;
}

function* hello() {
  const res2 = yield* withHandler(test(), {
    *name(name, k) {
      const res = yield* k('Hello ' + name);
      return res;
    },
  });
  return res2;
}
describe('Effects', () => {
  // it('should work', () => {
  //   start(withLog(main()), (val) => {
  //     console.log('done', val);
  //   });
  // });
  // it('should have state', () => {
  //   start(withLog(state('not jason', mainState())), (done) =>
  //     console.log('done:', done),
  //   );
  // });
  // it('should wait 500 milliseconds before printing', (finish) => {
  //   const programWaitHandled = withWait(mainWait());
  //   const programLogHandled = withLog(programWaitHandled);
  //   const programAsyncHandled = async(programLogHandled);
  //   start(programAsyncHandled, (done) => {
  //     console.log('done: ', done);
  //     finish();
  //   });
  // });
  // it('should log reversed', () => {
  //   const program = logTest();
  //   const programLogHandled = withHandler(program, {
  //     *log(data: { args: any[]; method: 'log' }, cont) {
  //       const res = yield* cont();
  //       console.log(...data.args);
  //       // return res;
  //     },
  //   });
  //   start(programLogHandled, () => {});
  // });
  // it('should concat the msgs', () => {
  //   const program = hello();
  //   start(program, (res) => {
  //     expect(res).toBe('plusOne: 234Hello worldHello worldHello world');
  //     console.log(res);
  //   });
  // });
  it('should be wrong', () => {
    const program = testmulti();
    start(program, console.log);
  });
});

export function state<G extends GEN, T>(value: T, comp: G) {
  let val = value;
  return withHandler<G, StateGet<T> | StateSet<T>>(comp, {
    //   *return(val) {
    //     return val;
    //   },
    *state(data: { method: 'get' } | { method: 'set'; value: T }, cont) {
      if (data.method === 'get') {
        return yield* cont(val);
      }
      val = data.value;
      return yield* cont();
    },
  });
}

export function withLog<G extends GEN>(comp: G) {
  return withHandler<G, Log>(comp, {
    //   *return(val) {
    //     return val;
    //   },
    *log(data: { args: any[]; method: 'log' }, cont) {
      console.log(...data.args);
      const res = yield* cont();
      return res;
    },
  });
}
export type Remove<T, RemoveValue> = T extends RemoveValue
  ? never
  : T extends infer U | RemoveValue
  ? U
  : never;

export function withWait<G extends GEN, Milliseconds extends number>(
  //   comp: GEN<Wait<Milliseconds> | E, R>,
  comp: G,
) {
  return withHandler<G, Wait<Milliseconds>>(comp, {
    //   *return(val) {
    //     return val;
    //   },
    *wait(data: { milliseconds: number }, cont) {
      yield* toGenStar((parent: GEN) => {
        setTimeout(() => resume(parent, undefined), data.milliseconds);
      });
      return yield* cont();
    },
  });
}

export function async<G extends GEN, V>(comp: G) {
  return withHandler<G, Async<V>>(comp, {
    *resolve(data: { promise: Promise<V> }, cont) {
      yield (parent: GEN) => {
        data.promise.then((val) => {
          resume(parent, val);
        });
      };
      return yield* cont();
    },
  });
}

const movies = function* () {
  const page = yield* List(1, 2, 3, 4, 5);
  const movies = yield* TMBDAPI.discover({
    sorting: 'popularity-desc',
    page: page,
    releasedBefore: '15126123',
  });
  const movie = yield* movies;
  const credits = yield* TMBDAPI.movieCredits(movie.id);
  const actors = yield* TMBDAPI.person((yield* credits).id);
  return { movie, credits, actors };
};

type Movie = {
  id: string;
};
type Credits = {
  id: string;
};
type Person = {};
type List<T> = Generator<Amb, T, any>;
declare function List<T extends any[]>(...args: T): List<T[number]>;
declare const TMBDAPI: {
  discover: (args: any) => Generator<Async<List<Movie>>, List<Movie>>;
  movieCredits: (arg: any) => Generator<Async<List<Credits>>, List<Credits>>;
  person: (arg: any) => Generator<Async<Person>, Person, any>;
};
function* hey() {
  yield* op('hi1', 10);
  yield* op('hi2', 20);
  yield* op('hi3', 30);
  yield* op('hi3', 30);
  yield* op('hi1', 10);
  yield* op('hi2', 20);
}
function* testmulti() {
  const res = yield* withHandler(
    withHandler(hey(), {
      *return(val) {
        return [val, ''];
      },
      *hi1(num, k) {
        const [res, acc] = yield* k(num);
        return [res, num + acc];
      },
      *hi2(num, k) {
        const [res, acc] = yield* k(num);
        // return "(hi2 " + res + ")";
        return [res, num + acc];
      },
    }),
    {
      *return(val) {
        return val.join('');
      },
      *hi3(num, k) {
        const res = yield* k(num);
        return '(hi3 ' + res + ')';
      },
    },
  );
  return res;
}
