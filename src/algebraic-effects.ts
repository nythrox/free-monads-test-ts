import { Remove } from './effects.test';

function isGenerator(x: any): x is GEN {
  return x && typeof x.next === 'function';
}

export type OP<_R = any, S extends string = string, T = any> = {
  _IS_OP: true;
  _________R: _R;
  data: T;
  type: S;
};
function isOp<R = any, S extends string = string, T = any>(
  x: any,
): x is OP<R, S, T> {
  return x && x._IS_OP;
}
export function op<
  _OP extends OP<any, any, any>,
  S = _OP['type'],
  T = _OP['data'],
  R = _OP extends OP<infer R, any, any> ? R : never
>(type: S, data: T): Generator<_OP, R, any> {
  // return (yield {
  //   _IS_OP: true,
  //   type,
  //   data,
  // } as any) as R;
  return toGenStar<_OP, R>({
    _IS_OP: true,
    type,
    data,
  } as any);
}

export function* toGenStar<T, R>(valueToYield: T): Generator<T, R, any> {
  return (yield valueToYield) as R;
}

export function resume(gen: GEN, arg?: any) {
  return resumeGenerator(gen, arg, null);
}
function resumeGenerator(gen: GEN, next: any, value?: any, done?: true) {
  if (done === undefined)
    ({ value, done } = gen.next(next) as { value: any; done?: true });

  if (done) {
    const _return = gen._return;
    if (isGenerator(_return)) {
      resumeGenerator(_return, value);
    } else if (typeof _return === 'function') {
      _return(value);
    }
  } else {
    if (typeof value === 'function') {
      value(gen);
    } else if (isOp(value)) {
      while (true) {
        const result = performOp(value.type, value.data, gen);
        if (result !== undefined) {
          ({ value, done } = gen.next(result) as { value: any; done?: true });
          if (!isOp(value)) {
            resumeGenerator(gen, null, value, done);
            break;
          }
        } else {
          break;
        }
      }
    } else {
      resumeGenerator(gen, value);
    }
  }
}

export function start<R>(gen: GEN<never, R>, onDone: (val: R) => void) {
  gen._return = onDone;
  resumeGenerator(gen, null);
}
// export interface Handler<R = any> {
//   // ExtraEnv = any,  TODO: missing extra env from inside the handlers
//   return?: (val: any) => GEN<any, R>;
//   [P: string]: HandlerFn<any, R> | undefined;
// }
interface Ret<R> {
  // ExtraEnv = any,  TODO: missing extra env from inside the handlers
  return?: (val: any) => GEN<any, R>;
}
export interface Handler<R = any>
  extends Record<string, HandlerFn<any, R> | undefined>,
    Ret<R> {}
export type HandlerFn<ExtraEnv = any, R = any> = {
  (val: any, resume: (value?: any) => Generator<any, R, any>): GEN<ExtraEnv, R>;
};

interface EffFn {
  _return?: GEN | ((val: any) => void);
  _handler?: Handler;
}
type CalculateGN<Gen extends GEN, Removed> = Gen extends GEN<infer A, infer B>
  ? GEN<Remove<A, Removed>, B>
  : never;
export type GEN<E = any, R = any> = Generator<E, R, any> & EffFn;
export function withHandler<G extends GEN, RemoveEnv>(
  gen: G,
  handler: Handler<any>,
): CalculateGN<G, RemoveEnv> {
  function* withHandlerFrame(): GEN {
    const result = yield* gen;
    // eventually handles the return value
    if (handler.return) {
      return yield* handler.return(result);
    }
    return result;
  }
  const withHandlerGen = withHandlerFrame();
  withHandlerGen._handler = handler;
  return toGenStar((lastGen) => {
    withHandlerGen._return = lastGen;
    resumeGenerator(withHandlerGen, null);
  }) as any;
  // return toGenStar(withHandlerGen as any) as any;
}

function performOp(type: string, data: any, performGen: GEN) {
  // finds the closest handler for effect `type`
  let withHandlerGen = performGen;
  while (withHandlerGen._handler == null || !withHandlerGen._handler[type]) {
    if (withHandlerGen._return == null) break;
    withHandlerGen = withHandlerGen._return as GEN;
  }

  if (withHandlerGen._handler == null || !withHandlerGen._handler[type]) {
    throw new Error(`Unhandled Effect ${type}!`);
  }

  // found a handler, get the withHandler Generator
  const handlerFunc = withHandlerGen._handler[type] as HandlerFn;

  const handlerGen = handlerFunc(data, function delimitedCont(value) {
    return toGenStar((currentGen: GEN) => {
      withHandlerGen._return = currentGen;
      resumeGenerator(performGen, value);
    }) as any;
  });
  // if (isGenerator(handlerGen)) {
  // will return to the parent of withHandler
  handlerGen._return = withHandlerGen._return;
  resumeGenerator(handlerGen, null);
  // } else {
  //   console.log('@@@@@@@@HANDLER WAS NOT A GENERATOR')
  //   return handlerGen;
  // }
  return;
}
