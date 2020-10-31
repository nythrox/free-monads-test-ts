// function isGenerator(x) {
//   return x != null && typeof x.next === "function";
// }
let debug = false;
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
    throw new Error("yielded invalid value");
  }
}
function resume(gen, val, then) {
  runGenerator(gen, val, then);
}
function start(gen, onDone) {
  // gen._return = onDone;
  runGenerator(gen, null, onDone);
}
function copyTo(copyElements, toObj) {
  for (const p in copyElements) {
    toObj[p] = copyElements[p];
  }
}
function addNext(handlers, then, lastHandlers) {
  for (const p in handlers) {
    const prev = handlers[p];

    handlers[p] = function (...args) {
      const gen = prev(...args);
      gen._handlers = lastHandlers;
      return gen;
      // return res;
    };

    handlers[p]._then = then;
  }
}
function* handle(fn, handlers) {
  return yield (lastGen, lastThen) => {
    const lastHandlers = lastGen._handlers;
    const thisThen = (res) => {
      resume(lastGen, res, lastThen);
    };
    const subGen = (function* () {
      const g = typeof fn === "function" ? fn() : fn;
      const result = yield* g;
      if (handlers.return != null) {
        const returnGen = handlers.return(result);
        returnGen._handlers = lastHandlers;
        return yield (r, t) => {
          resume(returnGen, result, (val) => {
            resume(r, val, t);
          });
        };
      }
      return result;
    })();
    addNext(handlers, thisThen, lastHandlers, lastThen);
    if (lastHandlers) {
      // Object.setPrototypeOf(handlers, lastHandlers);
      subGen._handlers = Object.assign(Object.create(lastHandlers), handlers);
    } else subGen._handlers = handlers;
    start(subGen, thisThen);
  };
}

function* perform(name, values) {
  if (debug)
    console.log(
      `perform: (${name}, ${
        typeof values === "string" ? `"${values}"` : values
      })`
    );
  // curr gen is only used to get the handlers and _then
  return yield (currGen, then) => {
    // TODO: what is then???
    const handlers = currGen._handlers;
    const handler = handlers[name];
    if (!handler) throw new Error("No handler for " + name);
    const _then = handler._then;
    // console.log("eq", then === _then);
    const handlerGen = handler(values, function* (val) {
      // pause handler, dont need to get gen and next because we already have it
      return yield (__, __undefined) => {
        // console.log(__ === handlerGen, __undefined === undefined);
        // resume function depending on handler with value (val)
        if (debug) console.log("->", val);
        resume(currGen, val, (handlerVal) => {
          resume(handlerGen, handlerVal, then); // TODO: why does chaning _then for then change the result in a weird way?
        });
      };
    });
    start(handlerGen, _then); //start handlerGen, it gets interrupted and someone else handles it
    // TODO: when I take out `then` I am forced to yield* k() in the handlers
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
  const p23 = yield* perform("plusOne", 3);
  console.log("plusOne: " + p11 + p12 + p23);
  return "plusOne: " + p11 + p12 + p23;
}

function* test() {
  // const msg = yield* perform("name", "world");
  const number = yield* handle(test2, {
    *plusOne(num, k) {
      const res = yield* k(num + 1);
      const name = yield* perform("name", "world");
      return res + "num" + num;
    }
  });
  console.log("num", number);
  // return 0;
  return number;
  // return msg + "!";
}

function* hello() {
  const res = yield* getMsg(10);
  const res2 = yield* handle(test, {
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
// start(handle(startGen, Object.create(null)), (val) => console.log("done", val));

// function* pausePlayTest() {
//   return yield* pause((play) => {
//     setTimeout(() => {
//       play(10);
//     }, 400);
//   });
// }
// start(pausePlayTest(), console.log);

function* consoleTest() {
  yield* perform("print", "A");
  yield* perform("print", "B");
  yield* perform("print", "C");
}

// start(
// handle(consoleTest, {
//   *print(val, k) {
//     const ret = yield* k();
//     console.log(val);
//     return ret;
//   }
// }),
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
  const res = yield* state(5, counter());
  console.log(res);
}

function state(val, gen) {
  return handle(
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
    }),
    {
      *print(val, k) {
        const ret = yield* k();
        console.log(val);
        return ret;
      }
    }
  );
}

start(mainCounter(), () => {});
