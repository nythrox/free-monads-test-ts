function clonableIterator(it, history = []) {
  const gen = it();
  history.forEach((v) => gen.next(v));
  return {
    next(arg) {
      history.push(arg);
      const res = gen.next(arg);
      return res;
    },
    clone() {
      return clonableIterator(it, [...history]);
    },
    [Symbol.iterator]() {
      return this;
    }
  };
}

let debug = false;
let handlers = Object.create(null);
let returnToDelimitedContinuation = null;

function runGenerator(gen, arg, then) {
  const { value, done } = gen.next(arg);
  // console.log(value);
  if (done) {
    // const _return = gen._return;
    then(value);
  } else {
    // no recursion: TLDR, if you are gonna pause it, you better play it too
    if (value?.PAUSE) {
      value.f(gen, then);
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
    // console.log("setting", p, "to", handlers);
    handlers[p].handlerScope = handlers;
  }
}

function* handleMulti(fn, newHandlers) {}

function* handle(fn, newHandlers) {
  return yield {
    PAUSE: true,
    f: (lastGen, lastThen) => {
      const thisThen = (res) => {
        resume(lastGen, res, lastThen);
      };
      const currHandlers = handlers;
      const currCont = returnToDelimitedContinuation;
      const handlersObj = Object.assign(Object.create(handlers), newHandlers);
      addScopeInfo(handlersObj);
      // Object.setPrototypeOf(newHandlers, handlers);
      // handlers = newHandlers;
      handlers = handlersObj;
      returnToDelimitedContinuation = thisThen;
      const subGen = clonableIterator(
        function* () {
          let result = yield* fn();
          if (newHandlers.return) {
            const returnGen = newHandlers.return(result);
            result = yield* returnGen;
          }
          return result;
        },
        [],
        lastThen
      );
      // {
      //   before: {
      //     handlers: handlersObj,
      //     returnToDelimitedContinuation: thisThen
      //   },
      //   after: {
      //     handlers: currHandlers,
      //     returnToDelimitedContinuation: currCont
      //   }
      // }
      start(subGen, (val) => {
        handlers = currHandlers;
        returnToDelimitedContinuation = currCont;
        thisThen(val);
      });
    }
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
  return yield {
    PAUSE: true,
    f: (currGen, then) => {
      // if (currGen.before) {
      //   handlers = currGen.before.handlers;
      //   returnToDelimitedContinuation =
      //     currGen.before.returnToDelimitedContinuation;
      // }

      const currHandlers = handlers;
      const handler = currHandlers[name];
      // go up once in scope (for handlers)
      if (!handler) throw new Error("No handler found for: " + name);
      handlers = Object.getPrototypeOf(handler.handlerScope);

      const handlerGen = handler(values, function* (val) {
        // pause handler, dont need to get gen and next because we already have it
        return yield {
          PAUSE: true,
          f: () => {
            // console.log(__ === handlerGen, __undefined === returnToDelimitedContinuation);
            // resume function depending on handler with value (val)
            if (debug) console.log("->", val);
            handlers = currHandlers;

            let g = currGen;
            if (currGen.clone) {
              g = currGen.clone();
              //   console.log(
              //     "has clone",
              //     handlers,
              //     currGen.clone().next(undefined, true)
              //   );
            }
            resume(g, val, (handlerVal) => {
              resume(handlerGen, handlerVal, (val) => {
                // if (currGen.after) {
                //   handlers = currGen.after.handlers;
                //   returnToDelimitedContinuation =
                //     currGen.after.returnToDelimitedContinuation;
                // }
                then(val);
              });
            });
          }
        };
      });

      start(handlerGen, returnToDelimitedContinuation);
    }
  };
}

function* pause(fn) {
  return yield (gen, next) => {
    fn((val) => {
      resume(gen, val, next);
    });
  };
}

// function* testMulti() {
//   const res = yield* handle(
//     function* () {
//       const num = yield* perform("list", [1, 2, 3, 4]);
//       return num + 1;
//     },
//     {
//       *list(list, k) {
//         const vals = [];
//         for (const item of list) {
//           vals.push(yield* k(item));
//         }
//         return vals;
//       }
//     }
//   );
//   console.log(res);
// }

// start(testMulti(), () => {});

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
  return "plusOne: " + p11 + p12 + p23 + msg;
  // return ["10"];
  // return p11;
}

function* test() {
  // console.log("bef", handlers);
  // const msg = yield* perform("name", "world");
  // console.log("aft", handlers);
  const number = yield* handle(test2, {
    *return(val) {
      // return [val, yield* perform("name", "hi")];
      return [val];
    },
    *plusOne(num, k) {
      const [res] = yield* k(num + 1);
      const name = yield* perform("name", "notworld");
      return [res, name];
    }
  });
  return number.join("");
  // return msg + "!";
}

function* hello() {
  // const res = yield* getMsg(10);
  const res2 = yield* handle(test, {
    *return(val) {
      return val;
      // return val;
    },
    *name(name, k) {
      const res = yield* k("Hello " + name);
      const res2 = yield* k("hwwo " + name);
      return [res + res2];
      // return res;
    },
    *exn(exn, k) {
      return exn;
    }
  });
  // return [res, res2];
  return res2;
  // return res;
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
