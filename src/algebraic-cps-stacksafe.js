
// this doensnt work because: just pausing/resuming means nothing... you literally just did what callback already did;
// problem w dynamic scope in handlers: when entering a handler, the scope goes -1 so the handler can re-throw effects,
// but inside the handler if we want to introduce another handler, the scope should be normal and not -1
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

class Break {}
Break.prototype.chain = c;
Break.prototype.map = m;
export const stop = () => new Break();
const pure = (value) => new Of(value);

const chain = (chainer) => (action) => new Chain(chainer, action);

const map = (mapper) => (action) =>
  new Chain((val) => pure(mapper(val)), action);

const effect = (key) => (value) => new Perform(key, value);

const perform = (key, value) => new Perform(key, value);

const handler = (handlers) => (program) => new Handler(handlers, program);

const resume = (value) => new Resume(value);
const resume$ = (interpreter) => (value) => {
  interpreter.return(value, interpreter.lastStop.context);
  interpreter.lastStop = undefined;
  if (interpreter.isPaused) {
    interpreter.run();
  }
};
const findHandlers = (key) => (array) => (onError) => {
  // reverse map
  for (var i = array.length - 1; i >= 0; i--) {
    const curr = array[i];
    if (curr.handlers[key]) {
      return [curr.handlers[key], curr.context];
    }
  }
  onError(Error("Handler not found: " + key.toString()));
};
// todo: callback that can return void (single) or return another callback
class Interpreter {
  constructor(onDone, onError, context) {
    console.log("hi");
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
        case Break: {
          this.lastStop = { context };
          this.context = undefined;
          // action.callback((value) => {
          //   this.return(value, context);
          //   if (this.isPaused) {
          //     this.run();
          //   }
          // });
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
          const h = findHandlers(action.key)(context.handlers)(this.onError);
          if (!h) return;
          const [handler, transformCtx] = h;

          const handlerAction = handler(value, this);
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
            this.onError(Error("using resume outside of handler"));
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
          const { handlers } = prev.action;
          this.context = {
            resume: prev.resume,
            handlers: prev.handlers,
            prev: prev.prev,
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
        default: {
          this.onError("invalid state");
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
  io(thunk) {
    const value = thunk();
    return resume(value);
  }
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
  async: (iopromise, interpreter) =>
    io(iopromise).chain((promise) => {
      console.log("hello");
      promise.then(resume$(interpreter));
      return stop();
    })

  // .chain((promise) =>

  //   // callback((_, done, execInProgramScope) => {
  //   //   promise.then(done);
  //   //   promise.catch((err) => {
  //   //     execInProgramScope(raise(err))(done);
  //   //   });
  //   }).chain(resume)

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
        handlers: [],
        prev: undefined,
        resume: undefined,
        action: pipe(program, withIoPromise, toEither, withIo)
      }
    ).run();
  });
run(waitFor(() => Promise.resolve(20)))
  .then(console.log)
  .catch(console.error);
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
