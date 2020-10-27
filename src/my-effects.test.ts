import { AddHandler, PerformEffect, run } from './my-effects';

export {};
const getMsg = function* (name: string) {
  const eff = { name: 'getMsg', data: name } as PerformEffect<string>;
  return (yield eff) as string;
};

function* test() {
  const res = yield* getMsg('something');
  return res;
}

function* main() {
  yield {
    getMsg: (data, resume) => {
      resume('jason' + data);
    },
  } as AddHandler;
  const res = yield* test();
  console.log(res);
  return res;
}

describe('my effects', () => {
  it('should work', () => {
    run(main(), null, (val) => console.log('done:', val), {});
  });
});
