// Model typings
export class TypeInfo<T> {
  private dummyValue: T; // This is to make TS show errors if we want to assign an incompatible type for a model field
  constructor(public readonly typeid: string) {} // typeid value is not actually used (otherwise than to check truthyness), but might be useful for debugging or imlicit validaitons (not done here)
}

export function isPrimitiveTypeInfo(x: any, v?: any): x is TypeInfo<any> {
  return !!x && !!x.typeid;
}

// Special tag to make complex data types opaque
// Caveat: might be weird if we need to nadle something as opaque in some forms and exploded in others
export interface PrimitiveType {
  __opaque_interface_do_not_go_inside?(): never;
}

export type ModelTypeInfo<T> = T extends boolean
  ? TypeInfo<boolean> // Boolean needs a separate branch or it breaks down into TypeInfo<true> | TypeInfo<false> :(
  : T extends PrimitiveType | string | number // Needs to list all other primitive TS types. I'm not handling tuples
  ? TypeInfo<T>
  : T extends Array<infer E>
  ? ArrayModelTypeInfo<E>
  : GroupModelTypeInfo<T>;

export type GroupModelTypeInfo<T> = {
  -readonly [Key in keyof T]-?: ModelTypeInfo<T[Key]>;
};

export type ArrayModelTypeInfo<E> = Array<ModelTypeInfo<E>>;

export class Types {
  public static int = new TypeInfo<number>('int');
  public static float = new TypeInfo<number>('float');
  public static string = new TypeInfo<string>('string');
  public static boolean = new TypeInfo<boolean>('boolean');
  // For a complex type handled by a single atomic FormControl
  public static opaque<T>(typeid: string) {
    return new TypeInfo<T>(typeid);
  }
}

export type ElementType<T> = T extends Array<infer E> ? E : never;
