const c = function (chainer) {
  return new Chain(chainer, this);
};
const m = function (mapper) {
  return new Chain((e) => of(mapper(e)), this);
};
class Of {
  constructor(value) {
    this.value = value;
  }
}
Of.prototype.chain = c;
Of.prototype.map = m;
class Chain {
  constructor(chainer, after) {
    this.chainer = chainer;
    this.after = after;
  }
}
Chain.prototype.chain = c;
Chain.prototype.map = m;
class Perform {
  constructor(key, value) {
    this.key = key;
    this.value = value;
  }
}
Perform.prototype.chain = c;
Perform.prototype.map = m;
class Handler {
  constructor(handlers, program) {
    this.handlers = handlers;
    this.program = program;
  }
}
Handler.prototype.chain = c;
Handler.prototype.map = m;
class Resume {
  constructor(value) {
    this.value = value;
  }
}
Resume.prototype.chain = c;
Resume.prototype.map = m;
class Callback {
  constructor(callback) {
    this.callback = callback;
  }
}
Callback.prototype.chain = c;
Callback.prototype.map = m;

class MultiCallback {
  constructor(callback) {
    this.callback = callback;
  }
}
MultiCallback.prototype.chain = c;
MultiCallback.prototype.map = m;

export const of = (value) => new Of(value);

export const chain = (chainer) => (action) => new Chain(chainer, action);

export const map = (mapper) => (action) =>
  new Chain((val) => of(mapper(val)), action);

export const perform = (key) => (value) => new Perform(key, value);

export const handler = (handlers) => (program) =>
  new Handler(handlers, program);

const resume = (value) => new Resume(value);

const callback = (callback) => new Callback(callback);
const handlerMulti = (callback) => new MultiCallback(callback);
const pipe = (a, ...fns) => fns.reduce((res, fn) => fn(res), a);

const findHandlers = (key) => (arr) => (reject) => {
  let handlers;
  // reverse map
  arr.forEach((_, index, array) => {
    const curr = array[array.length - 1 - index];
    if (curr.handlers[key]) {
      handlers = [curr.handlers[key], curr.context];
    }
  });
  if (!handlers) {
    reject(Error("Handler not found: " + key.toString()));
    return;
  }
  return handlers;
};

// todo: callback that can return void (single) or return another callback
class Interpreter {
  constructor(
    action,
    onDone,
    onError,
    context = { handlers: [], prev: undefined, resume: undefined, action }
  ) {
    context.action = action;
    this.context = context;
    this.context.action = action;
    this.onError = onError;
    this.onDone = onDone;
  }
  run() {
    while (this.context) {
      const action = this.context.action;
      const context = this.context;
      switch (action.constructor) {
        case Chain: {
          if (!this.hasValue) {
            // const nested = action.after;
            // switch (nested.type) {
            //   case "of": {
            //     this.context = {
            //       handlers: context.handlers,
            //       prev: context.prev,
            //       resume: context.resume,
            //       action: action.chainer(nested.value)
            //     };
            //     break;
            //   }
            //   default: {}}
            this.context = {
              handlers: context.handlers,
              prev: context,
              resume: context.resume,
              action: action.after
            };
            break;
          } else if (this.hasValue) {
            this.context = {
              handlers: context.handlers,
              prev: context.prev,
              resume: context.resume,
              action: action.chainer(this.value)
            };
            this.doneReturning();
          }
          break;
        }
        case Of: {
          // this.context = context.nextCtx.apply(this, [action.value]);
          this.return(action.value, context);
          break;
        }

        case Callback: {
          this.context = undefined;
          action.callback((value) => {
            this.return(value, context);
            // this.context = context.nextCtx.apply(self, [value]);
            this.run();
          });
          break;
        }
        case MultiCallback: {
          this.context = undefined;
          // action.callback((newAction) => {
          //   this.context = {
          //     handlers: context.handlers,
          //     prev: context,
          //     resume: context.resume,
          //     action: newAction
          //   };
          //   this.run();
          // });
          action.callback(
            // exec
            (execAction) => (then) => {
              const ctx = {
                prev: context.prev,
                resume: context.resume,
                handlers: context.handlers,
                action: execAction
              };
              new Interpreter(execAction, then, this.onError, ctx).run();
            },
            // done
            (value) => {
              this.return(value, context);
              this.run();
            }
          );
          break;
        }
        case Handler: {
          const { handlers, program } = action;
          if (!this.hasValue) {
            this.context = {
              prev: context,
              action: program,
              resume: context.resume,
              handlers: [
                ...context.handlers,
                {
                  handlers,
                  context
                }
              ]
            };
          } else if (this.hasValue) {
            const ret = handlers.return
              ? handlers.return
              : (val) => new Of(val);
            this.context = {
              resume: context.resume,
              handlers: context.handlers,
              prev: context.prev,
              action: ret(this.value)
            };
            this.doneReturning();
          }
          break;
        }
        case Perform: {
          const { value } = action;
          const [handler, transformCtx] = findHandlers(action.key)(
            context.handlers
          )(this.onError);

          const handlerAction = handler(value);
          const activatedHandlerCtx = {
            // 1. Make the activated handler returns to the *return transformation* parent,
            // and not to the *return transformation* directly (so it doesn't get transformed)
            prev: transformCtx.prev,
            action: handlerAction,
            handlers: transformCtx.handlers,
            resume: {
              transformCtx,
              programCtx: context
            }
          };
          this.context = activatedHandlerCtx;
          break;
        }
        case Resume: {
          // inside activatedHandlerCtx
          const { value } = action;
          const { resume } = context;
          // context of the transformer, context of the program to continue
          const { transformCtx, programCtx } = resume;
          if (!resume) {
            this.onError(Error("using resume outside of handler"));
            return;
          }

          // 2. continue the main program with resumeValue,
          // and when it finishes, let it go all the way through the *return* transformation proccess
          // /\ it goes all the way beacue it goes to programCtx.prev (before perform) that will eventuallyfall to transform
          this.context = programCtx.prev;
          //3. after the transformation is done, return to the person chaining `resume`
          // /\ when the person chaining resume (activatedHandlerCtx) is done, it will return to the transform's parent
          transformCtx.prev = context.prev;
          this.hasValue = true;
          this.value = value;
          // console.log(
          //   "hi, returning to",
          //   this.context,
          //   "with value",
          //   this.value
          // );
          break;
        }
        default: {
          this.onError(Error("invalid instruction: " + JSON.stringify(action)));
          return;
        }
      }
    }
  }
  return(value, context) {
    if (!context.prev) {
      this.onDone(value);
      this.context = undefined;
    } else {
      this.context = context.prev;
      this.hasValue = true;
      this.value = value;
    }
  }
  doneReturning() {
    this.hasValue = false;
    this.value = undefined;
  }
}
const ctx = {
  handlers: [],
  prev: undefined,
  resume: {
    transformCtx: {},
    programCtx: {
      prev: {
        action: chain((e) => of(e))()
      }
    }
  }
};
new Interpreter(
  resume(10),
  (res) => console.log("done", res),
  console.error,
  ctx
);
// .run();

const run = (program) =>
  new Promise((resolve, reject) => {
    new Interpreter(program, resolve, reject).run();
  });
function eff(n) {
  if (n < 1)
    return callback((done) => {
      setTimeout(() => done(), 0);
    });
  return callback((done) => {
    setTimeout(() => done(), 0);
  }).chain(() => eff(n - 1));
}

function p(n) {
  if (n < 1) return Promise.resolve();
  return Promise.resolve().then(() => p(n - 1));
}

async function main() {
  const promise1 = performance.now();
  await p(1000000);
  const promise2 = performance.now();
  const PromiseTime = promise2 - promise1;
  const p1 = performance.now();
  await run(eff(1000000));
  const p2 = performance.now();
  const EffTime = p2 - p1;
  console.log(
    "eff1:",
    EffTime,
    "promise:",
    PromiseTime,
    "faster:",
    EffTime < PromiseTime ? "eff" : "promise"
  );
}
const toArray = handler({
  return: (val) => of([val]),
  foreach: (array) => {
    const nextInstr = (arr, newArr = []) => {
      const [first, ...rest] = arr;
      if (arr.length === 0) {
        return of(newArr);
      } else
        return resume(first)
          .map((val) => [...newArr, ...val])
          .chain((newArr) => nextInstr(rest, newArr));
    };
    return nextInstr(array);
  }
});
const stream = (initials) => {
  const self = {
    history: initials ? initials : [],
    listen: function (callback) {
      this.history.forEach((item) => callback(item));
      this.listeners.push(callback);
    },
    concat: function (stream) {
      this.history = [...this.history, ...stream.history];
      stream.listen((n) => {
        self.push(n);
      });
    },
    push: function (item) {
      this.history.push(item);
      this.listeners.forEach((fn) => fn(item));
    },
    listeners: [],
    disposeFns: [],
    onDispose: function (fn) {
      this.disposeFns.push(fn);
    },
    dispose: function () {
      this.disposeFns.forEach((fn) => fn());
    }
  };
  return self;
};
const str = stream(Array.from({ length: 10 }));
const foreachStream = perform("foreachStream");
const toStream = handler({
  return: (val) => of(stream([val])),
  foreachStream: (str) =>
    handlerMulti((exec, done) => {
      const newStream = stream();
      str.listen((value) => {
        exec(resume(value))((stream2) => {
          stream2.listen((n) => {
            newStream.push(n);
          });
        });
      });
      str.onDispose(() => {
        newStream.dispose();
      });
      done(newStream);
    })
});
const strprogram = toStream(foreachStream(str).map((n) => 2));

// run(strprogram).then((stream) => {
//   const arr = [];
//   stream.listen((e) => arr.push(e));
//   console.log(arr);
// });

Promise.prototype.await = function () {
  return waitFor(this);
};

const wait = (seconds) =>
  callback((done) => {
    setTimeout(done, seconds);
  });
const waitFor = perform("promise");

const promise = handler({
  return: (x) => of(x),
  promise: (promise) => callback((done) => promise.then(done)).chain(resume)
});

const foreach = perform("foreach");
const arr = Array.from({ length: 100 });
const arrProgram = promise(
  toArray(foreach(arr).chain((n) => Promise.resolve("owo").await()))
);

// run(arrProgram).then(console.log).catch(console.error);

main();
const repeat = (times, interval) =>
  callback((resume) => {
    let int = 1;
    const id = setInterval(() => {
      if (int === times) {
        clearInterval(id);
      } else {
        resume();
        int++;
      }
    }, interval);
  });

const withHi = handler({
  hi: () => wait(20).chain(() => resume(500).map((n) => "num: " + n))
});
const withHiMulti = handler({
  hi: (value) =>
    handlerMulti((exec, done) => {
      exec(resume(value))((o1) => {
        exec(resume(value + 1))((o2) => {
          done([...o1, ...o2]);
        });
      });
    })
  // wait(20).chain(() => resume(500).map((n) => "num: " + n))
});
const hi = perform("hi");
const program = withHiMulti(
  hi(0)
    // .map((n) => n * 2)
    .chain((num) => hi(10).map((n) => [num, n]))
);

// run(program).then(console.log).catch(console.error);

function a(n) {
  if (n === 1) {
    // return callback((done) => setTimeout(() => done(1), 0));
    return callback((done) => Promise.resolve(1).then(done));
    // return of(1);
  }
  // return of(1).chain(() => a(n - 1));
  return callback((done) => Promise.resolve(1).then(done)).chain(() =>
    a(n - 1)
  );
}

// run(a(1000))
//   .then(() => console.log("done6s"))
//   .catch(console.error);
