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
interface Wait<T extends number> extends OP<T, 'wait', { milliseconds: T }> {}

// todo:
/**
 
    - transform all effects into a map { state: _, wait: _, log: _ }
      that way you can have type-safe effect handlers

    - add *extra effects* on the handlers type signature without having to be specified

  
 
    note: there is ways to discover the extra env being added, but not ways to discover whats being removed (UNLESS you get it by the key 'wait', but that would be general)
 
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

function* mainWait() {
  yield* log('stated waiting...');
  yield* wait(500);
  yield* log('finished waiting');
  const res = state('not_jason', mainState());
  yield* log('res: ', res);
  return 10;
}
describe('Effects', () => {
  //   it('should work', () => {
  //     start(withLog(main()), (val) => {
  //       console.log('done', val);
  //     });
  //   });
  //   it('should have state', () => {
  //     start(withLog(state('not jason', mainState())), (done) =>
  //       console.log('done:', done),
  //     );
  //   });
  it('should wait 500 milliseconds before printing', (finish) => {
    const programWaitHandled = withWait(mainWait());
    const programLogHandled = withLog(programWaitHandled);
    start(programLogHandled, (done) => {
      console.log('done: ', done);
      finish();
    });
  });
});

const res = state('not_jason', mainState());
export function state<G extends GEN, T>(value: T, comp: G) {
  let val = value;
  return withHandler<StateGet<T> | StateSet<T>>()(comp,{
    //   *return(val) {
    //     return val;
    //   },
    *state(data: { method: 'get' } | { method: 'set'; value: T }, cont) {
      if (data.method === 'get') {
        return yield* cont(val);
      } else {
        val = data.value;
        return yield* cont(undefined);
      }
    },
  })
}

export function withLog<G extends GEN>(comp: G) {
  return withHandler<Log>()(comp, {
    //   *return(val) {
    //     return val;
    //   },
    *log(data: { args: any[]; method: 'log' }, cont) {
      console.log(...data.args);
      const res = yield* cont(undefined);
      return res;
    },
  });
}

export type Remove<T, RemoveValue> = T extends RemoveValue
  ? never // ran out of effects
  : T extends infer U | RemoveValue
  ? U
  : never;

export function withWait<G extends GEN, Milliseconds extends number>(
  //   comp: GEN<Wait<Milliseconds> | E, R>,
  comp: G,
) {
  return withHandler<Wait<Milliseconds>>()(comp, {
    //   *return(val) {
    //     return val;
    //   },
    *wait(data: { milliseconds: number }, cont) {
      yield* toGenStar((parent: GEN) => {
        setTimeout(() => resume(parent), data.milliseconds);
      });
      return yield* cont();
    },
  });
}
