import { gen, Handler, Next as Resume, run } from './interpreter-cps-gen';

export {};
function* main() {
  const res = yield* sleep(100);
  const n = yield* name();
  const v = yield* gen<number>((resume) => {
    resume(10);
  });
  return [res, n, v] as const;
}

const sleep = (millis: number) => {
  return gen<void>((next) => void setTimeout(next, millis) as void);
};

const name = () => {
  return gen<string>((next) => setTimeout(() => next('hi'), 500));
};

describe('generator cps gen test', () => {
  //   test('gen test', () => {
  //     run(main(), (d) => {
  //       expect(d).toEqual([null, 'hi', 10]);
  //     });
  //   });
  test('abort test', () => {
    run(start(main2), console.log);
  });
});

function* start<R>(genFunc: (abort: Resume) => Generator<Resume, R, any>) {
  const result = yield* gen<R>((abort) => {
    run(genFunc(abort), abort);
  });
  return result;
}
function* main2(abort: Resume) {
  const result = yield* parent(abort);
  return `main result: (${result})`;
}

function* parent(abort: Resume) {
  const result = yield* child(abort);
  return `parent result: (${result})`;
}

function* child(abort: Resume) {
  yield () => abort('child result');
  throw "This shouldn't happen";
  //   return 'hi';
}
