const effect = (key) => (value) => ({ key, value });
const perform = (effect) => (continuation) => ({
  effect,
  cont: continuation,
  type: "perform"
});
const handle = (handlers) => (program) => ({
  handlers,
  program,
  type: "handler"
});

const done = (value) => ({
  type: "done",
  value
});

const helloWorld = effect("hello_world");
const handleHelloWorld = handle({
  return: (value, exec, then) => {
    exec(done(value), (res) => {
      then([res]);
    });
    // then([value]);
  },
  hello_world: (value, exec, k, then) => {
    // exec(done(value + " owo"), (res) => {
    k(value + " owo", (after) => {
      console.log("a", after);
      then([...after, value + "owo", "~"]);
    });
    // }); // exec: execute with correct handlers
    // then(value);
  }
});
const program = handleHelloWorld(
  perform(helloWorld("hoi"))((res) =>
    perform(helloWorld("hoi"))((res2) => done("done: " + res + res2))
  )
  // perform(helloWorld("hoi"))((res) => done("done: " + res))
  // done("ho")
);

const pop = (arr) => arr.slice(0, arr.length - 1);
const last = (arr) => arr[arr.length - 1];

const findHandler = (key) => (arr) => {
  const l = last(arr);
  if (!l) throw new Error("Handler not found: " + key.toString());
  if (l.handlers[key]) {
    return [l.handlers[key], l.ref];
  }
  return findHandler(key)(pop(arr));
};

const interpret = (program, ref) => {
  if (program.type === "done") {
    ref.next(program.value);
    return;
  }
  if (program.type === "handler") {
    const { handlers, program: programBeingHandled } = program;
    const programBeingHandledRef = {
      prev: ref,
      next: (value) => {
        handlers.return(
          value,
          // exec
          (syntax) => (then) => {
            const syntaxRef = {
              // prev: ref, // no need for prev, it wont be called
              handlers: ref.handlers,
              // next: (e) => {
              //   console.log("should be undefined: ", syntaxRef.prev);
              //   then(e);
              // }
              next: then
            };
            interpret(syntax, syntaxRef);
          },
          programBeingHandledRef.prev.next
        );
      }
    };
    programBeingHandledRef.handlers = [
      ...ref.handlers,
      {
        handlers,
        ref: programBeingHandledRef
      }
    ];
    interpret(programBeingHandled, programBeingHandledRef);
    return;
  }
  if (program.type === "perform") {
    const { effect, cont } = program;
    const [handler, handlerRef] = findHandler(effect.key)(ref.handlers);
    handler(
      effect.value,
      // exec
      (syntax) => (then) => {
        const syntaxRef = {
          // prev: handlerRef, // no need for prev, it wont be called
          handlers: handlerRef.prev.handlers,
          next: then
          // next: (e) => {
          //   console.log("should be undefined2: ", syntaxRef.prev);
          //   then(e);
          // }
        };
        interpret(syntax, syntaxRef);
      },
      // k/resume
      (value) => (thenContinueHandler) => {
        const continuationSyntax = cont(value);
        //when the (return) transforming is done, call `thenContinueHandler`
        handlerRef.prev.next = thenContinueHandler;
        interpret(continuationSyntax, ref /* { ...ref }*/);
      },
      // instead of returning to parent, return to the handlers parent
      handlerRef.prev.next
    );
    return;
  }
};
const run = (initialProram, onDone) => {
  return interpret(initialProram, {
    prev: null,
    handlers: [],
    next: onDone
  });
};

// run(program, (e) => console.log("finished!! res: ", e));

const test0 = effect("test0");
const test1 = effect("test1");

const dostuff = perform(test1("hi0"))((hi0) =>
  perform(test1("hi1"))((hi1) =>
    perform(test0("hi2"))((hi2) =>
      perform(test1("hi3"))((hi3) => done(hi0 + hi1 + hi2 + hi3))
    )
  )
);

const pipe = (val, ...fns) => fns.reduce((val, fn) => fn(val), val);
const flow = (...fns) => (val) => fns.reduce((val, fn) => fn(val), val);
const of = (value) => (then) => then(value);
const chain = (chainer) => (cps) => (then) => cps((val) => chainer(val)(then));
const map = (mapper) => chain(flow(mapper, of));

const CPS = {
  do(fun) {
    function run(history) {
      const it = fun();
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
  },
  map,
  of,
  chain
};

const handleTest0 = handle({
  return: (val, exec, then) => {
    then(val + ".t0");
  },
  test0: (val, exec, k, then) => {
    // pipe(
    //   exec(perform(test1("owo"))((sla) => done(sla))),
    //   CPS.chain((e) =>
    //     pipe(
    //       k(val),
    //       CPS.map((res) => "~" + res + "~" + e)
    //     )
    //   )
    // )(then);

    CPS.do(function* () {
      const e = yield exec(perform(test1("owo"))((sla) => done(sla)));
      const res = yield k(val);
      return "~" + res + "~" + e;
    })(then);

    // exec(perform(test1("owo"))((e) => done(e)))((e) => {
    //   k(val)((res) => {
    //     then("~" + res + "~" + e);
    //   });
    // });
  }
});
const handleTest1 = handle({
  return: (val, exec, then) => {
    exec(done(val + ".t1"))(then);
  },
  test1: (val, exec, k, then) => {
    k(val)((res) => {
      exec(done("(" + res + ")"))(then);
    });
  }
});

const program2 = handleTest1(handleTest0(dostuff));

run(program2, console.log);
