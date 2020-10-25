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

// todo:
/**
 
    - transform all effects into a map { state: _, wait: _, log: _ }
      that way you can have type-safe effect handlers

    - add *extra effects* on the handlers type signature without having to be specified

  
 
 
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
  const res = yield* state('not_jason', mainState());
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

export function state<T, E, R>(value: T, comp: GEN<E, R>) {
  let val = value;
  return withHandler<E, StateGet<T> | StateSet<T>, R>(
    {
      //   *return(val) {
      //     return val;
      //   },
      *state(data: { method: 'get' } | { method: 'set'; value: T }, cont) {
        if (data.method === 'get') {
          return yield* cont(val);
        }
        // else if (data.method == 'set') {
        // else {
        val = data.value;
        return yield* cont(undefined);
        // }
      },
    },
    comp,
  );
}

export function withLog<E, R>(comp: GEN<E, R>) {
  return withHandler<E, Log, R>(
    {
      //   *return(val) {
      //     return val;
      //   },
      *log(data: { args: any[]; method: 'log' }, cont) {
        console.log(...data.args);
        const res = yield* cont(undefined);
        return res;
      },
    },
    comp,
  );
}
export type Remove<T, RemoveValue> = T extends RemoveValue
  ? never
  : T extends infer U | RemoveValue
  ? U
  : never;

export function withWait<E, Milliseconds extends number, R>(
  //   comp: GEN<Wait<Milliseconds> | E, R>,
  comp: GEN<E, R>,
) {
  return withHandler<E, Wait<Milliseconds>, R>(
    {
      //   *return(val) {
      //     return val;
      //   },
      *wait(data: { milliseconds: number }, cont) {
        yield* toGenStar((parent: GEN) => {
          setTimeout(() => resume(parent), data.milliseconds);
        });
        return yield* cont();
      },
    },
    comp,
  );
}
