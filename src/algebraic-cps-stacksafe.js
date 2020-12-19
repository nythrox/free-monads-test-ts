import { makeGeneratorDo, makeMultishotGeneratorDo } from "./utils";
class Of {
  constructor(value) {
    this.value = value;
  }
}
export class Chain {
  constructor(chainer, after) {
    this.chainer = chainer;
    this.after = after;
  }
}
export class Perform {
  constructor(key, value) {
    this.key = key;
    this.value = value;
  }
}
export class Handler {
  constructor(handlers, program) {
    this.handlers = handlers;
    this.program = program;
  }
}
export class Resume {
  constructor(value) {
    this.value = value;
  }
}

export class MultiCallback {
  constructor(callback) {
    this.callback = callback;
  }
}
export class SingleCallback {
  constructor(callback) {
    this.callback = callback;
  }
}
export class FinishHandler {
  constructor(value) {
    this.value = value;
  }
}
const c = function (chainer) {
  return new Chain(chainer, this);
};
const m = function (mapper) {
  return new Chain((e) => of(mapper(e)), this);
};

Of.prototype.chain = c;
Of.prototype.map = m;
Chain.prototype.chain = c;
Chain.prototype.map = m;
Perform.prototype.chain = c;
Perform.prototype.map = m;
Handler.prototype.chain = c;
Handler.prototype.map = m;
Resume.prototype.chain = c;
Resume.prototype.map = m;
MultiCallback.prototype.chain = c;
MultiCallback.prototype.map = m;
SingleCallback.prototype.chain = c;
SingleCallback.prototype.map = m;
FinishHandler.prototype.chain = c;
FinishHandler.prototype.map = m;

const finishHandler = (value) => new FinishHandler(value);

/**
 * Creates a action (monad) that returns a value `value`
 * @param value
 */
export const of = (value) => new Of(value);

export const chain = (chainer) => (action) => new Chain(chainer, action);

/**
 * Transforms the value inside an Action (monad)
 * @param mapper
 */
export const map = (mapper) => (action) =>
  new Chain((val) => of(mapper(val)), action);

/**
 * Creates an effect
 * @param key key of the effect to later be handled in a map
 * @param value value to be passed to the handler
 */

export const effect = (key) => (value) => new Perform(key, value);

/**
 * Provides handlers to the program passed in the `program` ar
 * @param handlers map of handlers
 * @param program program to handle
 */
export const handler = (handlers) => (program) =>
  new Handler(handlers, program);

/**
 * This function is the same as `handler` but with the `program` argument first and `handlers` argument second
 *
 * Provides handlers to the program passed in the `program` arg
 * @param program program to handle
 * @param handlers map of handlers
 */
export const handle = (program) => (handlers) => handler(handlers)(program);
export const resume = (value) => new Resume(value);

export const callback = (callback) => new MultiCallback(callback);
export const singleCallback = (callback) => new SingleCallback(callback);

const findHandlers = (key) => (array) => {
  let handlers;
  // reverse map
  for (var i = array.length - 1; i >= 0; i--) {
    const curr = array[i];
    if (curr.handlers[key]) {
      handlers = [curr.handlers[key], curr.context];
    }
  }
  if (!handlers) {
    throw Error("Handler not found: " + key.toString());
  }
  return handlers;
};
export class Interpreter {
  constructor(onDone, context) {
    this.context = context;
    this.onDone = onDone;
    this.isPaused = true;
  }
  run() {
    this.isPaused = false;
    while (this.context) {
      const action = this.context.action;
      const context = this.context;
      // console.log(action);
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
        case SingleCallback: {
          this.context = undefined;
          action.callback((value) => {
            this.return(value, context);
            if (this.isPaused) {
              this.run();
            }
          });
          break;
        }
        case FinishHandler: {
          this.context = undefined;
          const { callback, value } = action.value;
          // console.log("calling", callback.toString(), "with", value);
          callback(value);
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
                action: execAction.chain((n) =>
                  finishHandler({ callback: then, value: n })
                )
              };
              const i = new Interpreter(undefined, ctx);
              i.isClone = true;
              i.run();
            },
            // done
            (value) => {
              if (this.isClone && !context.prev) {
                this.onDone(value);
              } else {
                this.return(value, context);
                context.prev = undefined;
                if (this.isPaused) {
                  this.run();
                }
              }
            },
            // resume
            (value) => (then) => {
              const { resume } = context;
              const { transformCtx, programCtx } = resume;
              const ctx = this.nextInstruction(value, programCtx);
              ctx.prev = undefined;
              const i = new Interpreter(then, ctx);
              i.run();
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
          );
          if (!handler || !transformCtx) {
            return;
          }
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
          if (!resume) {
            throw new Error("using resume outside of handler");
            return;
          }
          const { transformCtx, programCtx } = resume;
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
          throw new Error("invalid instruction: " + JSON.stringify(action));
          return;
        }
      }
    }
    this.isPaused = true;
  }
  nextInstruction(value, currCtx) {
    const prev = currCtx && currCtx.prev;
    if (!prev) return undefined;
    switch (prev.action.constructor) {
      case Handler: {
        const { handlers } = prev.action;
        return {
          resume: prev.resume,
          handlers: prev.handlers,
          prev: prev.prev,
          action: handlers.return ? handlers.return(value) : new Of(value)
        };
      }
      case Chain: {
        return {
          handlers: prev.handlers,
          prev: prev.prev,
          resume: prev.resume,
          action: prev.action.chainer(value)
        };
      }
      default: {
        throw new Error("invalid state");
      }
    }
  }
  return(value, currCtx) {
    const next = this.nextInstruction(value, currCtx);
    if (next) {
      this.context = next;
    } else {
      this.onDone(value);
      this.context = undefined;
    }
  }
}
export const io = effect("io");
export const withIo = handler({
  return: (value) => of(() => value),
  io(thunk) {
    const value = thunk();
    return resume(value);
  }
});
export const run = (program) =>
  new Promise((resolve, reject) => {
    try {
      new Interpreter((thunk) => resolve(thunk()), {
        handlers: [],
        prev: undefined,
        resume: undefined,
        action: withIo(program)
      }).run();
    } catch (e) {
      reject(e);
    }
  });

export const Effect = {
  map,
  chain,
  of,
  single: makeGeneratorDo(of)(chain),
  do: makeMultishotGeneratorDo(of)(chain)
};
export const eff = Effect.single;
export const forEach = effect("forEach");

export const withForEach = handler({
  return: (val) => of([val]),
  forEach: (array) => {
    const nextInstr = (newArr = []) => {
      if (array.length === 0) {
        return of(newArr);
      } else {
        const first = array.shift();
        return resume(first).chain((a) => {
          for (const item of a) {
            newArr.push(item);
          }
          return nextInstr(newArr);
        });
      }
    };
    return nextInstr();
  }
});

export { flow, pipe, id } from "./utils";

import {
  effect,
  pipe,
  handler,
  resume,
  run,
  of,
  callback,
  Effect,
  singleCallback
} from "./src/";
// todo: callback that can return void (single) or return another callback

const zzz = effect("test");
const ez = () => zzz();
const seila = handler({
  test: () => resume()
});
const promise = () =>
  new Promise((resolve, reject) => {
    resolve();
  });

function eff(n) {
  if (n < 1) return ez();
  return ez().chain(() => eff(n - 1));
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
  await run(seila(eff(1000000)));
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
const str = stream(); //Array.from({ length: 10 })
const foreachStream = effect("foreachStream");
const withStream = handler({
  return: (val) => of(stream([val])),
  foreachStream: (str) =>
    callback((exec, done, resume) => {
      const newStream = stream();
      str.listen((value) => {
        console.log("exeking");
        exec(resume(value))((stream2) => {
          console.log("resumed", value);
          stream2.listen((n) => {
            console.log("n", n);
            newStream.push(n);
          });
        });
      });
      str.onDispose(() => {
        newStream.dispose();
      });
      // done(newStream);
    })
});
const waitFor = effect("promise");

const withPromise = handler({
  return: (x) => of(Promise.resolve(x)),
  promise: (promise) =>
    callback((exec, done) => promise.then(done)).chain(resume)
});

const waitMs = (ms) => new Promise((res, rej) => setTimeout(res, ms));
const strprogram = pipe(
  Effect.do(function* () {
    const num = yield foreachStream(str);
    const timeout = Math.random() * 500;
    yield waitFor(waitMs(timeout));
    // console.log("done waiting");
    // yield singleCallback((d) => setTimeout(d, 100));
    return "n " + num + " w " + timeout;
  }),
  withStream,
  withPromise
);

(async function () {
  const stream = await run(strprogram);

  const arr = [];
  stream.listen((e) => arr.push(e));
  stream.onDispose(() => {
    console.log("d", arr);
  });
  await Promise.all(
    Array.from({ length: 5 }).map((_, i) => {
      return waitMs(100 - i * 10).then(() => str.push(i));
    })
  );
  str.push(99);
  stream.dispose();
})();

Promise.prototype.await = function () {
  return waitFor(this);
};

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
          console.log("sbd", res);
        });
      }
      console.log("donning", newArray);
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
    // return nextInstr(array);
  }
});

const foreach = effect("foreach");
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
const hi = effect("hi");
const program = withHiMulti(
  hi(1)
    .map((n) => n * 2)
    .chain((num) => hi(10).map((n) => [num, n]))
);

// run(program).then(console.log).catch(console.error);

const test1 = effect("test1");
const test2 = effect("test2");
const test3 = effect("test3");

const withTest1 = handler({
  return: (val) => of(val + "f1"),
  // test1: (value) =>
  //   callback((exec, done) => {
  //     exec(resume(value + "!"))((val) => done("~" + val + "~"));
  //   }),
  test1: (value) => resume(value + "!").map((val) => "~" + val + "~")
});
const withTest2 = handler({
  return: (val) => of(val + "f2"),
  test2: (value) =>
    callback((exec, done) => {
      exec(resume(value + "!"))((val) => done("+" + val + "+"));
      // .chain((val) => finishHandler("+" + val + "+")));
    })

  // test2: (value) =>
  //   resume(value + "!").chain((val) =>
  //     singleCallback((done) => {
  //       done("+" + val + "+");
  //     })
  //   )
  // test2: (value) => resume(value + "!").map((val) => "+" + val + "+")
});
const withTest3 = handler({
  return: (val) => of(val + "f3"),
  test3: (value) =>
    callback((exec, done) => {
      exec(resume(value + "!"))((val) => done("(" + val + ")"));
      // exec(
      //   resume(value + "!")
      //     // owo
      //     .chain((val) => finishHandler("(" + val + ")"))
      //   // owo
      // );
    })
  // test3: (value) =>
  //   resume(value + "!").chain((val) =>
  //     singleCallback((done) => {
  //       done("(" + val + ")");
  //     })
  //   )
  // test3: (value) => resume(value + "!").map((val) => "(" + val + ")")
});

const programhandlerscopedtest = test3("hi0").chain((hi1) =>
  test2("hi2").chain((hi2) => test1("hi3").map((hi3) => hi1 + hi2 + hi3))
);

export const makeMultishotGeneratorDo = (of) => (chain) => (generatorFun) => {
  function run(history) {
    const it = generatorFun();
    let state = it.next();
    history.forEach((val) => {
      state = it.next(val);
    });
    if (state.done) {
      return of(state.value);
    }
    return chain((val) => {
      return run([...history, val]);
    })(state.value);
  }
  return run([]);
};

// pipe(programhandlerscopedtest, withTest1, withTest2, withTest3, run)
//   .then(console.log)
//   .catch(console.error);
const io = effect("io");
const awaitt = effect("async");
const raise = effect("error");

const withIo = handler({
  return: (val) => callback((exec, done) => done(() => val)),
  io: (io) =>
    callback((exec, done) => {
      exec(resume(io()))(done);
    })
});

const toEither = handler({
  return: (val) =>
    callback((exec, done) => done({ type: "right", value: val })),
  error: (err) => callback((exec, done) => done({ type: "left", error: err }))
});

const withAsyncIo = handler({
  return: (value) => callback((exec, done) => done(Promise.resolve(value))),
  async: (iopromise) =>
    callback((exec, done) => {
      exec(io(iopromise))((promise) => {
        promise
          .then((res) => {
            exec(resume(res))(done);
          })
          .catch((err) => {
            exec(raise(err))();
          });
      });
    })
});
const env = effect("env");
const withEnv = handler({
  env: () =>
    Effect.do(function* () {
      const res = yield resume("jason");
      const res2 = yield resume("nosaj");
      return [res, res2];
    })
  // callback((exec, done) => {
  //   exec(resume("jason"))((res) => {
  //     exec(resume("nosaj"))((res2) => {
  //       done([res, res2]);
  //     });
  //   });
  // })
});

const powpow = Effect.do(function* () {
  const name = yield env();
  const something = yield awaitt(() => Promise.resolve(10));
  const something2 = yield awaitt(() => Promise.resolve("err"));
  const something3 = yield awaitt(() => Promise.resolve(10));
  return name + something + something2 + something3;
});
// pipe(powpow, withEnv, withAsyncIo, toEither, withIo, run).then((io) => {
//   const p = io();
//   if (p.type === "left") {
//     console.error(p);
//   } else {
//     p.value.then(console.log);
//   }
// });

const listen = effect("listen");
const listenHandler = handler({
  return: (value) => of((listener) => listener(value)),
  listen: (event) =>
    callback((exec, done) => {
      done((listener) => {
        window[event] = (value) => {
          console.log("kkk");
          exec(resume(value))((event) => {
            console.log("resumed");
            event(listener);
          });
        };
      });
    })
});
const prgrm = Effect.do(function* () {
  const smh = yield listen("onclick");
  const owo = yield foreach([1, 2, 3, 4, 5]);
  return { received: smh, owo };
});

// pipe(prgrm, toArray, listenHandler, run)
//   .then((l) => {
//     l(console.log);
//   })
//   .catch(console.error);
