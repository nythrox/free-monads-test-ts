const {
  makeGeneratorDo,
  makeMultishotGeneratorDo,
  flow,
  pipe,
  id
} = require("./utils");
const c = function (chainer) {
  return new Chain(chainer, this);
};
const m = function (mapper) {
  return new Chain((e) => pure(mapper(e)), this);
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
  constructor(key, args) {
    this.key = key;
    this.args = args;
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
  constructor(cont, value) {
    this.cont = cont;
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
class SingleCallback {
  constructor(callback) {
    this.callback = callback;
  }
}
SingleCallback.prototype.chain = c;
SingleCallback.prototype.map = m;
class FinishHandler {
  constructor(value) {
    this.value = value;
  }
}
FinishHandler.prototype.chain = c;
FinishHandler.prototype.map = m;
const finishHandler = (value) => new FinishHandler(value);
const pure = (value) => new Of(value);

const chain = (chainer) => (action) => new Chain(chainer, action);

const map = (mapper) => (action) =>
  new Chain((val) => pure(mapper(val)), action);

const effect = (key) => (...args) => new Perform(key, args);

const perform = (key, ...args) => new Perform(key, args);

const handler = (handlers) => (program) => new Handler(handlers, program);

const resume = (continuation, value) => new Resume(continuation, value);

const callback = (callback) => new MultiCallback(callback);
const singleCallback = (callback) => new SingleCallback(callback);

const findHandlers = (key) => (context) => (onError) => {
  let curr = context;
  while (curr) {
    const action = curr.action;
    if (curr.action.constructor === Handler) {
      const handler = action.handlers[key];
      if (handler) {
        return [handler, curr.transformCtx];
      }
    }
    curr = curr.prev;
  }
  onError(Error("Handler not found: " + key.toString()));
};
// todo: callback that can return void (single) or return another callback
class Interpreter {
  constructor(onDone, onError, context) {
    this.context = context;
    this.onError = onError;
    this.onDone = onDone;
    this.isPaused = true;
  }
  run() {
    this.isPaused = false;
    while (this.context) {
      const action = this.context.action;
      const context = this.context;
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
          // console.log("stopping", this);
          this.context = undefined;
          const { callback, value } = action.value;
          // console.log("calling", callback.toString(), "with", value);
          callback(value);
          // this.done()
          // this.return(action.value, context);
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
                action: execAction.chain((n) =>
                  finishHandler({ callback: then, value: n })
                )
              };
              const i = new Interpreter(this.onDone, this.onError, ctx);
              i.isClone = true;
              i.run();
            },
            // done
            (value) => {
              if (this.isClone && !context.prev) {
                this.onDone(value);
              } else {
                this.return(value, context);
                if (this.isPaused) {
                  this.run();
                }
              }
            },
            // exec in program's scope
            (execAction) => (then) => {
              const ctx = {
                prev: context.prev,
                resume: context.resume,
                // handlers: context.resume.programCtx.handlers, // TODO
                action: execAction.chain((n) =>
                  finishHandler({ callback: then, value: n })
                )
              };
              const i = new Interpreter(this.onDone, this.onError, ctx);
              i.isClone = true;
              i.run();
            }
          );
          break;
        }
        case Handler: {
          const { handlers, program } = action;
          const transformCtx = {
            prev: context,
            action: handlers.return
              ? program.chain(handlers.return)
              : program.chain(pure),
            resume: context.resume
          };
          context.transformCtx = transformCtx;
          this.context = transformCtx;
          break;
        }
        case Perform: {
          const { args } = action;
          const h = findHandlers(action.key)(context)(this.onError);
          if (!h) return;
          const [handler, transformCtx] = h;
          const handlerAction = handler(...args, {
            transformCtx,
            programCtx: context
          });
          const activatedHandlerCtx = {
            // 1. Make the activated handler returns to the *return transformation* parent,
            // and not to the *return transformation* directly (so it doesn't get transformed)
            prev: transformCtx.prev,
            action: handlerAction
          };
          this.context = activatedHandlerCtx;
          break;
        }
        case Resume: {
          // inside activatedHandlerCtx
          const { value, cont } = action;
          // context of the transformer, context of the program to continue
          if (!resume) {
            this.onError(Error("Tried to resume outside of a handler"));
            return;
          }
          const { transformCtx, programCtx } = cont;
          // 3. after the transformation is done, return to the person chaining `resume`
          // /\ when the person chaining resume (activatedHandlerCtx) is done, it will return to the transform's parent
          transformCtx.prev = context.prev;
          // 2. continue the main program with resumeValue,
          // and when it finishes, let it go all the way through the *return* transformation proccess
          // /\ it goes all the way beacue it goes to programCtx.prev (before perform) that will eventually fall to transformCtx
          this.return(value, programCtx);
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
  return(value, currCtx) {
    const prev = currCtx && currCtx.prev;
    if (prev) {
      switch (prev.action.constructor) {
        case Handler: {
          this.return(value, prev);
          break;
        }
        case Chain: {
          this.context = {
            prev: prev.prev,
            resume: prev.resume,
            action: prev.action.chainer(value)
          };
          break;
        }
        default: {
          this.onError(new Error("Invalid state"));
        }
      }
    } else {
      this.onDone(value);
      this.context = undefined;
    }
  }
}
const io = effect("io");
const withIo = handler({
  return: (value) => pure(() => value),
  io: (thunk, k) => resume(k, thunk())
});

const Effect = {
  map,
  chain,
  of: pure,
  single: makeGeneratorDo(pure)(chain),
  do: makeMultishotGeneratorDo(pure)(chain)
};
const eff = Effect.single;
const forEach = effect("forEach");

const withForEach = handler({
  return: (val) => pure([val]),
  forEach: (array) => {
    const nextInstr = (newArr = []) => {
      if (array.length === 0) {
        return pure(newArr);
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

const raise = effect("error");
const handleError = (handleError) =>
  handler({
    error: (exn) => handleError(exn)
  });
const toEither = handler({
  return: (value) =>
    pure({
      type: "right",
      value
    }),
  error: (exn) =>
    pure({
      type: "left",
      value: exn
    })
});
const waitFor = effect("async");

const withIoPromise = handler({
  return: (value) => pure(Promise.resolve(value)),
  async: (iopromise) =>
    io(iopromise).chain((promise) =>
      callback((_, done, execInProgramScope) => {
        promise.then(done);
        promise.catch((err) => {
          execInProgramScope(raise(err))(done);
        });
      }).chain(resume)
    )
  // .chain((promise) =>
  //   singleCallback((done) => {
  //     promise.then((value) =>
  //       done({
  //         success: true,
  //         value
  //       })
  //     );
  //     promise.catch((error) => {
  //       done({
  //         success: false,
  //         error
  //       });
  //     });
  //   })
  // )
  // .chain((res) => {
  //   if (res.success) {
  //     return resume(res.value);
  //   } else {
  //     return raise(res.error);
  //   }
  // })
});
const run = (program) =>
  new Promise((resolve, reject) => {
    new Interpreter(
      (thunk) => {
        const either = thunk();
        if (either.type === "right") {
          resolve(either.value);
        } else {
          reject(either.value);
        }
      },
      reject,
      {
        prev: undefined,
        resume: undefined,
        action: pipe(program, withIoPromise, toEither, withIo)
      }
    ).run();
  });

// const defer = effect("defer");
// const withDefer = handler({
//   defer: (fn, k) => {
//     return resume(k).chain((value) => fn.map(() => value));
//   }
// });

// const program = eff(function* () {
//   yield defer(io(() => console.log("done1")));
//   yield io(() => console.log("loading"));
//   yield defer(io(() => console.log("done2")));
//   yield io(() => console.log("finshed"));
// });

// run(withDefer(program));

const fork = effect("fork");
const pause = effect("yield");

const schedule = (program) => {
  const queue = [];
  const enqueue = (k) => {
    queue.push(k);
  };
  const dequeue = () => {
    if (queue.length) {
      return resume(queue.shift());
    }
    return pure();
  };
  const spawn = handler({
    return: () => dequeue(),
    yield: (k) => {
      enqueue(k);
      return dequeue();
    },
    fork: (program, k) => {
      enqueue(k);
      return spawn(program);
    }
  });
  return spawn(program);
};
const log = (...args) => io(() => console.log(...args));

const tree = (id, depth) =>
  eff(function* () {
    yield log("starting with num", id);
    if (depth > 0) {
      yield log("forking num", id * 2 + 1);
      yield fork(tree(id * 2 + 1, depth - 1));
      yield log("forking num", id * 2 + 2);
      yield fork(tree(id * 2 + 2, depth - 1));
    } else {
      yield log("yielding in num", id);
      yield pause();
      yield log("resumed in number", id);
    }
    yield log("finishing number", id);
  });

run(schedule(tree(0, 2)));

// const print = effect("print");
// const withPrint = handler({
//   print: (value, k) => {
//     console.log(value);
//     return resume(k).map((res) => res + " printed " + value);
//   }
// });
// let callLater;
// const later = effect("later");
// const handleLater = handler({
//   later: (value, k) => {
//     callLater = k;
//     return pure(value);
//   }
// });
// const test = eff(function* () {
//   const result = yield later("do this later");
//   yield print("do after");
//   return "done " + result;
// });
// const program = handleLater(test);
// run(program).then(console.log).catch(console.error);

// run(withPrint(resume(callLater, "now")))
//   .then(console.log)
//   .catch(console.error);

module.exports = {
  flow,
  pipe,
  id,
  withForEach,
  eff,
  forEach,
  run,
  io,
  withIo,
  Interpreter,
  singleCallback,
  callback,
  chain,
  pure,
  map,
  handler,
  resume,
  perform,
  effect,
  Effect,
  toEither,
  waitFor,
  withIoPromise,
  raise,
  handleError
};
