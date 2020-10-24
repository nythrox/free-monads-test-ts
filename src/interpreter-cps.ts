export {};
type primitive =
  | string
  | number
  | boolean
  | undefined
  | bigint
  | ((arg: any, next: any) => void);

type Expression = primitive | Var | Fun | Add | Call;

export function fun(param: string, body: Expression) {
  return {
    type: 'fun',
    param,
    body,
  };
}

export function add(exp1: Expression, exp2: Expression) {
  return { type: 'add', exp1, exp2 };
}
export const is = <T>(type: string) => (obj: any): obj is T =>
  Boolean(typeof obj === 'object' && obj?.type === type);

const isVar = is<Var>('var');

const isAdd = is<Add>('add');

const isCall = is<Call>('call');
const isFn = is<Fun>('fun');

interface Add extends ReturnType<typeof add> {}

export function v(name: string) {
  return { type: 'var', name };
}
interface Var extends ReturnType<typeof v> {}
interface Fun extends ReturnType<typeof fun> {}
interface Call extends ReturnType<typeof call> {}
export function call(fun: Fun, arg: Expression) {
  return {
    type: 'call',
    fun,
    arg,
  };
}

export function evaluate(
  exp: Expression,
  env: Record<string, any>,
  next: (val: primitive) => void,
): void {
  if (isVar(exp)) {
    next(env[exp.name]);
  } else if (isAdd(exp)) {
    evaluate(exp.exp1, env, (val1) => {
      evaluate(exp.exp2, env, (val2) => {
        next((val1 as number) + (val2 as number));
      });
    });
  } else if (isFn(exp)) {
    const fn = function (value: any, next: (val: primitive) => void) {
      const funEnv = { ...env, [exp.param]: value };
      evaluate(exp.body, funEnv, next);
    };
    next(fn);
  } else if (isCall(exp)) {
    evaluate(exp.fun, env, (_fn) => {
      const fn = _fn as (value: any, next: (val: primitive) => void) => void;
      evaluate(exp.arg, env, (arg) => {
        fn(arg, next);
      });
    });
    // const funValue = evaluate(exp.fun, env) as (arg: any) => primitive;
    // const argValue = evaluate(exp.arg, env);
    // return funValue(argValue);
  } else next(exp as any);
}
