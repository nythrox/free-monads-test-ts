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

const callback = (callback) => new MultiCallback(callback);
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
    this.isPaused = true;
  }
  run() {
    const self = this;
    this.isPaused = false;
    while (this.context) {
      const action = this.context.action;
      const context = this.context;
      console.log(action);
      switch (action.constructor) {
        case Chain: {
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
        }
        case Of: {
          this.return(action.value, context);
          break;
        }

        case MultiCallback: {
          this.context = undefined;
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
              // this.return(value, context);
              if (self.isPaused) {
                this.run();
              }
            }
          );
          break;
        }
        case Handler: {
          const { handlers, program } = action;
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
          // this.context = programCtx.nextInstruction(value);
          this.return(value, programCtx);
          // this.nextInstruction(value, programCtx);
          // 3. after the transformation is done, return to the person chaining `resume`
          // /\ when the person chaining resume (activatedHandlerCtx) is done, it will return to the transform's parent
          transformCtx.prev = context.prev;
          break;
        }
        default: {
          this.onError(Error("invalid instruction: " + JSON.stringify(action)));
          return;
        }
      }
    }
    this.isPaused = true;
  }
  return(value, context) {
    const prev = context.prev;
    if (prev) {
      switch (context.prev.action.constructor) {
        case Handler: {
          const { handlers } = prev.action;
          this.context = {
            resume: prev.resume,
            handlers: prev.handlers,
            prev: prev.prev,
            nextInstruction: prev.nextInstruction,
            action: handlers.return ? handlers.return(value) : new Of(value)
          };
          break;
        }
        case Chain: {
          this.context = {
            handlers: prev.handlers,
            prev: prev.prev,
            resume: prev.resume,
            action: prev.action.chainer(value)
          };
          break;
        }
      }
    } else {
      this.onDone(value);
      this.context = undefined;
    }
  }
}
const run = (program) =>
  new Promise((resolve, reject) => {
    new Interpreter(program, resolve, reject).run();
  });

const effect = () => callback((exec, done) => done());
const promise = () =>
  new Promise((resolve, reject) => {
    resolve();
  });

function eff(n) {
  if (n < 1) return effect();
  return effect().chain(() => eff(n - 1));
}
function p(n) {
  if (n < 1) return promise();
  return promise().then(() => p(n - 1));
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
// main();
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
    callback((exec, done) => {
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
  callback((exec, done) => {
    setTimeout(done, seconds);
  });
const waitFor = perform("promise");

const withPromise = handler({
  return: (x) => of(x),
  promise: (promise) =>
    callback((exec, done) => promise.then(done)).chain(resume)
});

const toArray = handler({
  return: (val) => of([val]),
  foreach: (array) => {
    return callback((exec, done) => {
      let newArray = [];
      for (const item of array) {
        exec(resume(item))((res) => {
          for (const item of res) {
            newArray.push(item);
          }
        });
      }
      done(newArray);
    });
    // const nextInstr = (newArr = []) => {
    //   // const [first, ...rest] = arr;
    //   if (array.length === 0) {
    //     return of(newArr);
    //   } else {
    //     const first = array.shift();
    //     return (
    //       resume(first)
    //         //.map(a => [...newArr, ...a])
    //         .chain((a) => {
    //           for (const item of a) {
    //             newArr.push(item);
    //           }
    //           return nextInstr(newArr);
    //         })
    //     );
    //   }
    // };
    return nextInstr(array);
  }
});

const foreach = perform("foreach");
const arr = Array.from({ length: 10000 });
const arrProgram = toArray(foreach(arr).map(() => 1));
// run(arrProgram).then(console.log).catch(console.error);

// main();
const repeat = (times, interval) =>
  callback((exec, resume) => {
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
    callback((exec, done) => {
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
  hi(1)
    .map((n) => n * 2)
    .chain((num) => hi(10).map((n) => [num, n]))
);

// run(program).then(console.log).catch(console.error);

const test1 = perform("test1");
const test2 = perform("test2");
const test3 = perform("test3");

const withTest1 = handler({
  // return(val) {
  //   return of(val + "f1");
  // },
  // test1: (value) =>
  //   callback((exec, done) => {
  //     exec(resume(value + "!"))((val) => done("~" + val + "~"));
  //   })
  test1: (value) => resume(value + "!").map((val) => "~" + val + "~")
});
const withTest2 = handler({
  // return(val) {
  //   return of(val + "f2");
  // },
  // test2: (value) =>
  //   callback((exec, done) => {
  //     exec(resume(value + "!"))((val) => done("+" + val + "+"));
  //   })
  test2: (value) => resume(value + "!").map((val) => "^" + val + "^")
});
const withTest3 = handler({
  // return(val) {
  //   return of(val + "f3");
  // },
  // test3: (value) =>
  //   callback((exec, done) => {
  //     exec(resume(value + "!"))((val) => done("(" + val + ")"));
  //   })
  test3: (value) => resume(value + "!").map((val) => "(" + val + ")")
});

const programhandlerscopedtest = test1("hi0").chain((hi1) =>
  test2("hi2").chain((hi2) => test3("hi3").map((hi3) => hi1 + hi2 + hi3))
);

pipe(programhandlerscopedtest, withTest1, withTest2, withTest3, run)
  .then(console.log)
  .catch(console.error);
