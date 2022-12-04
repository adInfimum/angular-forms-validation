import {
  AbstractControl,
  AsyncValidatorFn,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { from, map, Observable } from 'rxjs';
import {
  isPrimitiveTypeInfo,
  ModelTypeInfo,
  ElementType,
  PrimitiveType,
  ArrayModelTypeInfo,
} from './types';

// Model and validations
export type ModelSpec<T> = T extends boolean
  ? Spec<boolean>
  : T extends PrimitiveType | string | number
  ? Spec<T>
  : T extends Array<infer E>
  ? ArraySpec<E>
  : // If I don't inline this here it doesn't work nice for code completion
    {
      -readonly [Key in keyof T]-?: ModelSpec<T[Key]>;
    };

export type GroupSpec<T> = {
  -readonly [Key in keyof T]-?: ModelSpec<T[Key]>;
};

type GroupSpecImpl<T> = GroupSpec<T> & {
  __group_model_spec_do_not_access: Spec<T>;
};

export function toSpec<T>(spec: ModelSpec<T>): Spec<T> {
  const gSpec = group(spec as GroupSpec<T>);
  return gSpec ?? (spec as Spec<T>);
}

export function group<T>(spec: GroupSpec<T>): Spec<T> {
  return (spec as GroupSpecImpl<T>)['__group_model_spec_do_not_access'];
}

export type ValidFn<T> = (
  value: T,
  index?: number
) => boolean | ValidationErrors;
export type AsyncValidFn<T> = (
  value: T,
  index?: number
) =>
  | Promise<boolean | ValidationErrors>
  | Observable<boolean | ValidationErrors>;
export type CondFn<T> = (value: T, index?: number) => boolean;

export class Spec<T> {
  constructor(public type: ModelTypeInfo<T>) {}

  protected validators: [ValidFn<T>, string][] = [];
  protected asyncValidators: [AsyncValidFn<T>, string][] = [];
  protected disablers: [Spec<unknown>, CondFn<unknown>, string][] = [];
  protected hiders: [Spec<unknown>, CondFn<unknown>][] = [];

  should(fn: (value: T, index?: number) => ValidationErrors): Spec<T>;
  should(fn: (value: T, index?: number) => boolean, message: string): Spec<T>;
  should(fn: ValidFn<T>, message?: string): Spec<T> {
    this.validators.push([fn, message]);
    return this;
  }

  shouldAsync(
    fn: (
      value: T,
      index?: number
    ) => Promise<ValidationErrors> | Observable<ValidationErrors>
  ): Spec<T>;
  shouldAsync(
    fn: (value: T, index?: number) => Promise<boolean> | Observable<boolean>,
    message: string
  ): Spec<T>;
  shouldAsync(fn: AsyncValidFn<T>, message?: string): Spec<T> {
    this.asyncValidators.push([fn, message]);
    return this;
  }

  disableIf<E>(scope: ModelSpec<E>, fn: CondFn<E>, tooltip?: string): Spec<T> {
    this.disablers.push([toSpec(scope) as Spec<unknown>, fn, tooltip]);
    return this;
  }

  hideIf<E>(scope: ModelSpec<E>, fn: CondFn<E>): Spec<T> {
    this.hiders.push([toSpec(scope) as Spec<unknown>, fn]);
    return this;
  }
}

export type SpecMap = Map<Spec<unknown>, [CondFn<unknown>, string?][]>;

export class SpecImpl<T> extends Spec<T> {
  constructor(type: ModelTypeInfo<T>) {
    super(type);
  }

  getDisablersMap() {
    const map: SpecMap = new Map();
    for (const disabler of this.disablers) {
      map.set(disabler[0], null);
    }
    for (const spec of map.keys()) {
      const specDisablers = this.disablers
        .filter((d) => d[0] === spec)
        .map((d) => [d[1] as CondFn<T>, d[2]]);
      map.set(spec, specDisablers as [CondFn<T>, string?][]);
    }
    return map;
  }

  getHidersMap() {
    const map: SpecMap = new Map();
    for (const hider of this.hiders) {
      map.set(hider[0], null);
    }
    for (const spec of map.keys()) {
      const specHiders = this.hiders
        .filter((h) => h[0] === spec)
        .map((h) => [h[1] as CondFn<T>]);
      map.set(spec, specHiders as [CondFn<T>, string?][]);
    }
    return map;
  }

  getValidators(): ValidatorFn[] {
    return this.validators.map(
      (fn) =>
        function (c: AbstractControl<T>) {
          return normalizeErrorResult(fn[0](c.value), fn[1]);
        }
    );
  }

  getAsyncValidators(): AsyncValidatorFn[] {
    return this.asyncValidators.map(
      (fn) =>
        function (c: AbstractControl<T>) {
          return from(fn[0](c.value)).pipe(
            map((error) => normalizeErrorResult(error, fn[1]))
          );
        }
    );
  }
}

function normalizeErrorResult(
  errors: boolean | ValidationErrors,
  message?: string
): ValidationErrors {
  if (typeof errors === 'boolean') {
    return !errors ? { message } : null;
  }
  return errors;
}

export class ArraySpec<E> extends SpecImpl<E[]> {
  public element: Spec<E>;

  constructor(type: ModelTypeInfo<E[]>) {
    super(type);
    this.element = new SpecImpl<E>(type[0]);
  }
}

function createSpecs<T>(modelType: ModelTypeInfo<T>): ModelSpec<T> {
  if (isPrimitiveTypeInfo(modelType)) {
    return new SpecImpl<T>(modelType) as Spec<T> as ModelSpec<T>;
  } else if (Array.isArray(modelType)) {
    type E = ElementType<T>;
    return new ArraySpec<E>(
      modelType as ArrayModelTypeInfo<E>
    ) as unknown as ModelSpec<T>;
  }
  type P = T[keyof T];
  const spec: Partial<GroupSpec<T>> = {};
  for (const p of Object.keys(modelType)) {
    const prop = p as keyof T;
    const field = modelType[prop as keyof ModelTypeInfo<T>];
    spec[prop] = createSpecs(field as ModelTypeInfo<P>);
  }
  Object.defineProperty(spec, '__group_model_spec_do_not_access', {
    enumerable: false,
    value: new SpecImpl<T>(modelType),
  });
  return spec as ModelSpec<T>;
}

export function ceateModel<T>(
  modelTyping: ModelTypeInfo<T>,
  createModelSpecification: (model: ModelSpec<T>) => void
): GroupSpec<T> {
  const spec = createSpecs(modelTyping);
  createModelSpecification(spec);
  return spec as GroupSpec<T>;
}
