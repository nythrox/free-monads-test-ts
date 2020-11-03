export type Overwrite<T, S extends any> = { [P in keyof T]: S[P] };
export type TupleUnshift<T extends any[], X> = T extends any ? ((x: X, ...t: T) => void) extends (...t: infer R) => void ? R : never : never;
export type TuplePush<T extends any[], X> = T extends any ? Overwrite<TupleUnshift<T, any>, T & { [x: string]: X }> : never;
export type UnionToIntersection<U> =(U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never
export type UnionToOvlds<U> = UnionToIntersection<U extends any ? (f: U) => void : never>;
export type PopUnion<U> = UnionToOvlds<U> extends ((a: infer A) => void) ? A : never;
/* end helpers */
/* main work */
export type UnionToTupleRecursively<T extends any[], U> = {
    1: T;
    0: PopUnion<U> extends infer SELF ? UnionToTupleRecursively<TuplePush<T, SELF>, Exclude<U, SELF>> : never;
}[[U] extends [never] ? 1 : 0]

export type UnionToTuple<U> = UnionToTupleRecursively<[], U>;
