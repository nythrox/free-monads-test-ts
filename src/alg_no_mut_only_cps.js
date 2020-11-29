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
  },
  hello_world: (value, exec, k, then) => {
    exec(done(value + " owo"), (res) => {
      k(res, (after) => {
        then(after);
      });
    }); // exec: execute with correct handlers
  }
});
const program = handleHelloWorld(
  perform(helloWorld("hoi"))((res) => done("done: " + res))
);

const pop = (arr) => arr.slice(0, arr.length - 1);
const last = (arr) => arr[arr.length - 1];

const findHandler = (key) => (a) => {
  const l = last(a);
  if (!l) throw new Error("Handler not found: " + key.toString());
  if (l.handlers[key]) {
    return [l.handlers[key], l.transform];
  }
  return findHandler(key)(pop(a));
};

/// // calls the next continatuation with a value. when that continuation is done, it calles callback2 with a value. when that one is done, it calls callback3 with a value
/// // nnnext: (val, (val, val => void) => void) => void
const stack = [];
const interpret = (program, next, customStack) => {
  if (program.type === "done") {
    next(program.value);
    return;
  }
  if (program.type === "handler") {
    reset(function (shift, next) {
      shift(
        (transform, done) => {
          stack.push({
            transform,
            handlers: program.handlers
          });
          interpret(program.program, done, stack);
        },
        (res) => {
          program.handlers.return(
            res,
            (syntax, after) => {
              interpret(syntax, after, [...stack]); // TODO: handler scope
            },
            next
          );
        }
      );
      //---
    }, next);
    return;
  }
  if (program.type === "perform") {
    const [handler, transform] = findHandler(program.effect.key)(customStack);
    handler(
      program.effect.value,
      // interpret
      (syntax, then) => {
        interpret(syntax, then, [...stack]); // TODO: handler scope
      },
      // k
      (value, thenContinueHandler) => {
        interpret(
          program.cont(value),
          (finished) => {
            transform(finished, (transformed) => {
              thenContinueHandler(transformed);
            });
          },
          stack
        );
      },
      next
    );
    return;
  }
};
const run = (initialProram, onDone) => {
  return interpret(initialProram, onDone, stack);
};

// run(program, (e) => console.log("finished!! res: ", e));

function reset(fn, then) {
  let mutable = { then };
  fn(
    function shift(inShift, restOfProgram) {
      inShift(program, then);
      function program(val, afterRestOfProgramDone) {
        mutable.then = (restofprogramdonevalue) => {
          afterRestOfProgramDone(restofprogramdonevalue);
        };
        restOfProgram(val);
      }
    },
    (val) => {
      mutable.then(val);
    }
  );
}

const test0 = effect("test0");
const test1 = effect("test1");

const dostuff = perform(test0("hi0"))((hi0) =>
  perform(test0("hi1"))((hi1) =>
    perform(test1("hi2"))((hi2) =>
      perform(test1("hi3"))((hi3) => done(hi0 + hi1 + hi2 + hi3))
    )
  )
);

const handleTest0 = handle({
  return: (val, exec, then) => {
    then(val + "t0");
  },
  test0: (val, exec, k, then) => {
    k(val, (res) => {
      then("~" + res + "~");
    });
  }
});
const handleTest1 = handle({
  return: (val, exec, then) => {
    then(val + "t1");
  },
  test1: (val, exec, k, then) => {
    k(val, (res) => {
      then("(" + res + ")");
    });
  }
});

const program2 = handleTest1(handleTest0(dostuff));

run(program2, console.log);
