export const FREE_URI = 'Free'

export type FREE_URI = typeof FREE_URI
export abstract class Free<Eff = any, A = any> {
  // note, if you put the type Eff inside the record, then typescript won't let you assign Free<Database, any> to Free<Async, any>

  Eff!: Eff
  A!: A;
  *[Symbol.iterator]() {
    return (yield this) as A
  }
  //   _Eff!: Eff
  //   private _A!: A
  //   private _Eff!: Eff
  //   chain<B>(chainer: (value: A) => Free<Eff, B>): Free<Eff, B> {
  //     return new Chain(this, chainer)
  //   }
  abstract chain<B, Eff2>(
    chainer: (value: A) => Free<Eff2, B>
  ): Free<Eff | Eff2, B>

  map<B>(mapper: (value: A) => B): Free<Eff, B> {
    // return new Return_(mapper(value))
    return this.chain((a) => new Pure(mapper(a))) as any
  }

  handle<HandledEff>(
    ...handlers: Handler<HandledEff, Eff>[]
  ): Free<Exclude<Eff, HandledEff>, A> {
    // Free<Remove<Eff, HandledEff>, A>
    if (isChained(this)) {
      for (const handler of handlers) {
        if (this.effRepr.symbol === handler.symbol) {
          const result = handler(this.effRepr.args as any, undefined as any)
          return this.next(result)
        }
      }
    }
    return this as any
  }
  //   abstract map<B>(mapper: (value: A) => B): Free<Eff, B>
}

// type sla = typeof handleErr extends Handler<any, any> ? true : false
// const createHandler = <T>(symbol: symbol) =>
//   Object.assign((...args: any) => undefined as any, {
//     symbol
//   }) as Handler<>
// export const handleExn = <T, R>(handler: (err: T) => R) =>
//   Object.assign((err: T) => handler(err), { symbol: ExnS }) as any
export type Handler<T, Eff> = {
  remove: T
  symbol: symbol
  (args: any[], eff: Eff): any
}
type hoi = Exn<number, string> extends infer U | Exn<any, any> ? U : false
// type sla = Remove<Exn<number, string>, Exn<any, any>>
function isChained(val: any): val is Chained {
  return val instanceof Chained
}
function isExn(val: Chained): val is Chained<Exn> {
  return !!(val.effRepr.symbol === ExnS)
}
export interface Exn<_T = any, _R = void> {
  raise: (exn: _T) => _R
}
export const ExnS = Symbol.for('@@effects/exn')

export const raise = <T, R = void>(exn: T) => free<Exn<T, R>, R>(ExnS, exn)

// export type Remove<A, B> = A extends B ? (A extends infer U & B ? U : never) : A
interface pure {
  readonly pure: unique symbol
}
interface impure {
  readonly impure: unique symbol
}
// export class Impure<Eff = impure, A = any> extends Free<Eff, A> {
//     chain<B, Eff2>(chainer: (value: A) => Free<Eff2, B>): Free<Eff & Eff2, B> {
//         throw new Error('Method not implemented.')
//     }

// }
export class Pure<A = any> extends Free<pure, A> {
  constructor(public value: A) {
    super()
  }
  chain<B>(chainer: (value: A) => Free<any, B>): Free<any, B> {
    return chainer(this.value)
    // return new FlatMap_(this, chainer)
  }

  //   map<B>(mapper: (value: A) => B): Free<any, B> {
  //     return new Of(mapper(this.value))
  //   }
}
interface EffectRepresentation<Args extends any[] = any[]> {
  symbol: symbol
  args: Args
}

export class Chained<
  Eff = any,
  A = any,
  EffRepr extends EffectRepresentation = EffectRepresentation,
  B = any
> extends Free<Eff, B> {
  constructor(public effRepr: EffRepr, public next: (value: A) => Free<Eff, B>) {
    super()
  }

  chain<C, Eff2>(chainer: (value: B) => Free<Eff2, C>): Free<Eff | Eff2, C> {
    // return this.prev.chain(this.next).chain(chainer)
    return new Chained(this.effRepr, (val: A) => this.next(val).chain(chainer))
  }

  //   map<C>(mapper: (value: B) => C): Free<any, C> {
  //     // return this.chain((b) => Return(mapper(b)))
  //     // return this.prev.chain(this.next).chain((b) => Return(mapper(b)))
  //     // return this.prev.chain(this.next).map(mapper)
  //   }
}
export const pure = <Eff, A = any>(value: A) =>
  (new Pure(value) as any) as Free<Eff, A>

// export const chain = <A, Eff extends Effect, Fn extends EffectCall<any>, B>(
//   free: Fn,
//   next: (value: A) => Free<Eff, B>
// ) => new Chain(free, next) as Free<Eff, B>

// const program = FlatMap(
//   FlatMap(Return(5), (a) => Return(7)),
//   (b) => Return('10')
// )

export const free = <Eff, A>(symbol: symbol, ...args: any[]) =>
  (new Chained(
    { symbol: symbol, args },
    (args) => new Pure(args)
  ) as any) as Free<Eff, A>

export type Handlers<Eff extends EasyEffect> = {
  [P in keyof Eff]: (
    ...args: Parameters<Eff[P]>
  ) => ReturnType<Eff[P]> | Promise<ReturnType<Eff[P]>>
}
interface fn {
  (...args: any[]): any
}
// sugar syntax
export interface EasyEffect {
  [P: string]: fn
}

export type IsEffect<
  T,
  Prop extends string | symbol | number,
  Fn extends fn = EasyEffect[Prop extends keyof EasyEffect ? Prop : never]
> = (
  val: any
) => val is Chained<
  T,
  any,
  EffectRepresentation<Parameters<Fn>>,
  ReturnType<Fn>
>

export const toFree = <
  Eff extends EasyEffect,
  Prop extends keyof Eff,
  Fn extends (...args: any) => any = Eff[Prop],
  Args extends any[] = Parameters<Fn>,
  Return = ReturnType<Fn>
>(): [(...args: Args) => Free<Eff, Return>, IsEffect<Eff, Prop>] => {
  const symbol = Symbol()
  return [
    (...args) => new Chained({ symbol, args }, (args) => new Pure(args) as any),
    (val): val is any => val instanceof Chained && val.effRepr.symbol === symbol
  ]
}

export function doFree<
  R,
  Free_ extends Free<any, any>,
  Effects = Free_ extends Free<infer E, any> ? E : never
  //   UnionEffects = UnionToIntersection<Effects>
>(fun: () => Generator<Free_, R, any>): Free<Effects, R> {
  const iterator = fun()
  const state = iterator.next()
  function run(state: IteratorResult<Free_, R>): any {
    if (state.done) {
      return new Pure(state.value)
    }
    return state.value.chain((val) => {
      return run(iterator.next(val))
    })
  }
  return run(state)
}
