export {};
type primitive =
  | string
  | number
  | boolean
  | undefined
  | bigint
  | ((arg: any) => any);

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
const isFun = is<Fun>('fun');

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

export function evaluate(exp: Expression, env: Record<string, any>): primitive {
  if (isVar(exp)) {
    return env[exp.name];
  }
  if (isAdd(exp)) {
    return (
      (evaluate(exp.exp1, env) as number) + (evaluate(exp.exp2, env) as number)
    );
  }
  if (isFun(exp)) {
    return function (value) {
      const funEnv = { ...env, [exp.param]: value };
      return evaluate(exp.body, funEnv);
    };
  }
  if (isCall(exp)) {
    const funValue = evaluate(exp.fun, env) as (arg: any) => primitive;
    const argValue = evaluate(exp.arg, env);
    return funValue(argValue);
  }

  return exp;
}
