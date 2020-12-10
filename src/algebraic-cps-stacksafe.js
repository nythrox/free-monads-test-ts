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
  
  export const of = (value) => new Of(value);
  
  export const chain = (chainer) => (action) => new Chain(chainer, action);
  
  export const map = (mapper) => (action) =>
    new Chain((val) => of(mapper(val)), action);
  
  export const perform = (key) => (value) => new Perform(key, value);
  
  export const handler = (handlers) => (program) =>
    new Handler(handlers, program);
  
  const resume = (value) => new Resume(value);
  
  const callback = (callback) => new Callback(callback);
  
  const pipe = (a, ...fns) => fns.reduce((res, fn) => fn(res), a);
  
  const findHandler = (key) => (arr) => (reject) => {
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
    constructor(action, onDone, onError) {
      this.context = {
        prev: undefined,
        resume: undefined,
        action,
        handlers: []
      };
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
              //   default: {
              this.context = {
                handlers: context.handlers,
                prev: context,
                resume: context.resume,
                action: action.after
              };
              break;
              // }
              // }
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
          case Callback: {
            this.context = undefined;
            action.callback((value) => {
              this.return(value, context);
              this.run();
            });
            break;
          }
          case Of: {
            this.return(action.value, context);
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
              const ret = handlers.return ? handler.return : (val) => new Of(val);
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
            const [handler, handlerCtx] = findHandler(action.key)(
              context.handlers
            )(this.onError);
  
            const handlerAction = handler(value);
            this.context = {
              // handlerCtx
              prev: handlerCtx.prev, // handlerCtx.prev instead of handlerCtx so it skips return
              action: handlerAction,
              handlers: handlerCtx.handlers,
              resume: {
                handlerCtx,
                programCtx: context
              }
            };
  
            break;
          }
          case Resume: {
            // inside handlerCtx
            const { value } = action;
            const { resume } = context;
            if (!resume) {
              this.onError(Error("using resume outside of handler"));
              return;
            }
            resume.handlerCtx.prev = context.prev;
            this.context = resume.programCtx.prev;
            this.hasValue = true;
            this.value = value;
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
  
  const run = (program) =>
    new Promise((resolve, reject) => {
      new Interpreter(program, resolve, reject).run();
    });
  
  function eff(n) {
    if (n < 1) return of({});
    return of({}).chain(() => eff(n - 1));
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
      "eff:",
      EffTime,
      "promise:",
      PromiseTime,
      "faster:",
      EffTime < PromiseTime ? "eff" : "promise"
    );
  }
  // main();
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
  
  const wait = (seconds) =>
    callback((done) => {
      setTimeout(done, seconds);
    });
  const withHi = handler({
    hi: () => wait(20).chain(() => resume(500).map((n) => "num: " + n))
  });
  
  const hi = perform("hi");
  const program = withHi(
    hi(20)
      .map((n) => n * 2)
      .chain((num) => hi(10))
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
  
  run(a(1000))
    .then(() => console.log("done6s"))
    .catch(console.error);
  