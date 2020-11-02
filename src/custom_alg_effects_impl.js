const nextImmutable = (regen, ...args) => (data) => {
  const gen = regen(...args);
  return gen.next(data), gen;
};

let debug = false;
let handlers = Object.create(null);
let returnToDelimitedContinuation = null;

function runGenerator(gen, arg, then) {
  const { value, done } = gen.next(arg);

  if (done) {
    // const _return = gen._return;
    then(value);
  } else {
    // no recursion: TLDR, if you are gonna pause it, you better play it too
    if (typeof value === "function") {
      value(gen, then);
      return;
    }
    throw new Error("yielded invalid value: " + value.toString());
  }
}
function resume(gen, val, then) {
  runGenerator(gen, val, then);
}
function start(gen, onDone) {
  // gen._return = onDone;
  runGenerator(gen, null, onDone);
}
function addScopeInfo(handlers) {
  for (const p in handlers) {
    console.log("setting", p, "to", handlers);
    handlers[p].handlerScope = handlers;
  }
}

function* handleMulti(fn, newHandlers) {}

function* handle(fn, newHandlers) {
  return yield (lastGen, lastThen) => {
    const thisThen = (res) => {
      resume(lastGen, res, lastThen);
    };
    const currHandlers = handlers;
    handlers = Object.assign(Object.create(handlers), newHandlers);
    // Object.setPrototypeOf(newHandlers, handlers);
    // handlers = newHandlers;
    const subGen = (function* () {
      returnToDelimitedContinuation = thisThen;
      const g = typeof fn === "function" ? fn() : fn;
      let result = yield* g;
      handlers = currHandlers;
      if (newHandlers.return) {
        const returnGen = newHandlers.return(result);
        result = yield* returnGen;
      }
      return result;
    })();
    addScopeInfo(handlers);
    start(subGen, thisThen);
  };
}
function debugPerform(name, values) {
  if (debug) {
    console.log(
      `perform: (${name}, ${
        typeof values === "string" ? `"${values}"` : values
      })`
    );
    console.log("handlers", handlers);
  }
}
function* perform(name, values) {
  debugPerform(name, values);
  // curr gen is only used to get the handlers and _then
  const currHandlers = handlers;
  const handler = currHandlers[name];
  // go up once in scope (for handlers)
  if (!handler) throw new Error("No handler found for: " + name);
  handlers = Object.getPrototypeOf(handler.handlerScope);
  return yield (currGen, then) => {
    if (!handler) throw new Error("No handler for " + name);
    const handlerGen = handler(values, function* (val) {
      // pause handler, dont need to get gen and next because we already have it
      return yield () => {
        // console.log(__ === handlerGen, __undefined === returnToDelimitedContinuation);
        // resume function depending on handler with value (val)
        if (debug) console.log("->", val);
        handlers = currHandlers;
        resume(currGen, val, (handlerVal) => {
          resume(handlerGen, handlerVal, then);
        });
      };
    });
    start(handlerGen, returnToDelimitedContinuation);
  };
}

function* pause(fn) {
  return yield (gen, next) => {
    fn((val) => {
      resume(gen, val, next);
    });
  };
}

// function* ambTest() {
//   const res = yield* handle(function* () {}, {
//     *amb(list, resume) {
//       const vals = list.map((e) => yield* resume(e));
//       return vals;
//     }
//   });
// }
// const ambTestGen = ambTest();
// start(ambTestGen, (val) => console.log("done", val));

// calling a yield* function*(){} will call it in the same handler scope
// calling a yield* handler(function*(){},x) will call it in a new scope x (new handler frame)
function* test2() {
  // yield* perform("exn", "Nooo!");
  const p11 = yield* perform("plusOne", 1);
  const p12 = yield* perform("plusOne", 2);
  const msg = yield* perform("name", "world");
  const p23 = yield* perform("plusOne", 3);
  console.log("plusOne: " + p11 + p12 + p23);
  return "plusOne: " + p11 + p12 + p23;
}

function* test() {
  const msg = yield* perform("name", "world");
  const number = yield* handle(test2, {
    *return(val) {
      return [val, yield* perform("name", "hi")];
    },
    *plusOne(num, k) {
      const name = yield* perform("name", "notworld");
      const [res] = yield* k(num + 1);
      return [res, name];
    }
  });
  console.log("num", number);
  // return 0;
  return number.join("");
  // return msg + "!";
}

function* hello() {
  const res = yield* getMsg(10);
  const res2 = yield* handle(test, {
    *return(val) {
      return val;
      // return val;
    },
    *name(name, k) {
      const res = yield* k("Hello " + name);
      return res;
    },
    *exn(exn, k) {
      return exn;
    }
  });
  return [res, res2];
}

function* getMsg(msg) {
  return yield (res, then) => {
    resume(res, msg, then);
  };
}

const startGen = hello();
start(startGen, (val) => console.log("done", val));

// function* pausePlayTest() {
//   return yield* pause((play) => {
//     setTimeout(() => {
//       play(10);
//     }, 400);
//   });
// }
// start(pausePlayTest(), console.log);

// function* consoleTest() {
//   yield* perform("print", "A");
//   yield* perform("print", "B");
//   yield* perform("print", "C");
// }

// start(
//   handle(consoleTest, {
//     *print(val, k) {
//       const ret = yield* k();
//       console.log(val);
//       return ret;
//     }
//   }),
//   () => {}
// );

function* counter() {
  const i = yield* perform("get");
  if (i <= 0) return "done";
  else {
    yield* perform("put", i - 1);
    return yield* counter();
  }
}

function* mainCounter() {
  const res = yield* state(50, counter());
  console.log(res);
}

function state(val, gen) {
  return withPrint(
    handle(gen, {
      *return(res) {
        return [res, val];
      },
      *get(_, k) {
        const [r] = yield* k(val);
        return [r, val];
      },
      *put(v, k) {
        val = v;
        const [ret] = yield* k();
        return [ret, val];
      }
    })
  );
}

const withPrint = (gen) =>
  handle(gen, {
    *return(res) {
      return res;
    },
    *print(val, k) {
      const ret = yield* k();
      console.log(val);
      return ret;
    }
  });

// start(mainCounter(), () => {});

// function* asyncExample() {
//   yield* perform("")
//   const res = yield* perform("wait", 1000);
// }
