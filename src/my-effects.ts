export {};
export type Handler<E = any, T = any> = (
  performEffect: E,
  resume: (val: T) => void,
) => void;

export type AddHandler = {
  [P: string]: Handler<any>;
};

export type PerformEffect<T = any> = {
  name: string;
  data: T;
};

export type Yield = AddHandler | PerformEffect;
const isNewHandler = (obj: any): obj is AddHandler => {
  return typeof obj == 'object';
};
const isEffect = (obj: any): obj is PerformEffect => {
  return typeof obj == 'object' && obj.name != undefined;
};
export const run = <_E, R>(
  gen: Generator<Yield, R, any>,
  next: any = null,
  then: (val: R) => void,
  lastHandlers: Record<string, Handler>,
) => {
  let handlers: Record<string, Handler> = Object.create(lastHandlers);
  const { value, done } = gen.next(next);
  console.log('yielded:', value);
  if (done) {
    console.log(done, 'donning with ,', value);
    then(value as R);
  } else if (isNewHandler(value)) {
    for (const prop in value) {
      handlers[prop] = value[prop];
    }
    handlers = {
      ...handlers,
      ...value,
    };
    run(gen, null, then, handlers);
  } else if (isEffect(value)) {
    const handler = handlers[value.name];
    console.error('handler,', handler);
    if (!handler) {
      throw new Error('No handler found for effect: ' + value.name);
    }
    handler(value.data, (res) => {
      run(gen, res, then, handlers);
    });
  }
};




Promise.resolve(10).then((res) => {
    
})