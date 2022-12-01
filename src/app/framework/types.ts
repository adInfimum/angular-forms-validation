// Model typings
export class TypeInfo<T> {
  private dummyValue: T; // This is to make TS show errors if we want to assign an incompatible type for a model field
  constructor(public readonly typeid: string) {}
}

export function isPrimitiveTypeInfo(x: any, v?: any): x is TypeInfo<any> {
  return !!x.typeid;
}

export type ModelTypeInfo<T> = T extends {}
  ? {
      -readonly [Key in keyof T]-?: ModelTypeInfo<T[Key]>;
    }
  : T extends Array<infer E>
  ? Array<ModelTypeInfo<E>>
  : TypeInfo<T>;

export class Types {
  public static get int() {
    return new TypeInfo<number>('int');
  }
  public static get float() {
    return new TypeInfo<number>('float');
  }
  public static get string() {
    return new TypeInfo<string>('string');
  }
  public static get boolean() {
    return new TypeInfo<boolean>('boolean');
  }
  // For a complex type handled by a single atomic FormControl (not sure if we have that, but it could happen)
  public static opaque<T>() {
    return new TypeInfo<T>('opaque');
  }
}
