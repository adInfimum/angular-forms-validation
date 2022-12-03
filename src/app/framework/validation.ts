import { AsyncValidatorFn, ValidatorFn } from '@angular/forms';
import { from, map, Observable } from 'rxjs';
import {
  isPrimitiveTypeInfo,
  ModelTypeInfo,
  TypeInfo,
  ElementType,
  PrimitiveType,
  GroupModelTypeInfo,
} from './types';

// Model and validations
export type ModelValidation<T, G> = T extends boolean
  ? Validation<boolean, G>
  : T extends PrimitiveType | string | number
  ? Validation<T, G>
  : T extends Array<infer E>
  ? Array<ModelValidation<E, Array<E>>>
  : {
      -readonly [Key in keyof T]-?: ModelValidation<T[Key], T>;
    };

export class Model<T> {
  constructor(
    public readonly types: ModelTypeInfo<T>,
    public readonly validations: ModelValidation<T, T>
  ) {}

  public subModel<E>(accessor: (m: T) => E): Model<E> {
    const typeAccessor = accessor as unknown as (
      m: ModelTypeInfo<T>
    ) => ModelTypeInfo<E>;
    const specAccessor = accessor as unknown as (
      m: ModelValidation<T, T>
    ) => ModelValidation<E, E>;
    return new Model(typeAccessor(this.types), specAccessor(this.validations));
  }
}

export interface Validation<T, G> extends ValidationSpecStart<T> {
  get group(): ValidationSpecStart<G>;
}

export class ValidationImpl<T, G> implements Validation<T, G> {
  validators: ValidatorFn[] = [];
  asyncValidators: AsyncValidatorFn[] = [];
  groupValidators: ValidatorFn[] = [];
  asyncGroupValidators: AsyncValidatorFn[] = [];
  disabledCondition: ValidCondition<G>;

  constructor(readonly typeInfo: TypeInfo<T>) {}

  public disabledWhen(condition: ValidCondition<G>) {
    this.disabledCondition = condition;
  }

  public get should() {
    return new ValidationSpecImp<T>(
      (v) => this.validators.push(v),
      (v) => this.asyncValidators.push(v)
    ) as unknown as ValidationSpec<T>;
  }

  // TODO: this is very simplistic and doesn't handle nested group validation (only the inner-most group can be validated)
  public get group() {
    return {
      should: new ValidationSpecImp<G>(
        (v) => this.groupValidators.push(v),
        (v) => this.asyncGroupValidators.push(v)
      ) as unknown as ValidationSpec<G>,
    };
  }
}

export type ValidCondition<T> = (value: T) => boolean;
type AsyncValidCondition<T> = (
  value: T
) => Promise<boolean> | Observable<boolean>;

interface HasLegth {
  length: number;
}

interface ValidationSpecStart<T> {
  get should(): ValidationSpec<T>;
}

interface CommonValidationSpec<T> {
  get notBeEmpty(): CommonValidationSpec2<T>;
  satisfy(condition: ValidCondition<T>): CommonValidationSpec2<T>;
  satisfyAsync(condition: AsyncValidCondition<T>): CommonValidationSpec2<T>;
}

interface CommonValidationSpec2<T>
  extends CommonValidationSpec<T>,
    ValidationCondition<T> {}

interface NumberValidationSpec<T> extends CommonValidationSpec<T> {
  get beInteger(): NumberValidationSpec2<T>;
  get beFloat(): this;
}

interface NumberValidationSpec2<T>
  extends NumberValidationSpec<T>,
    ValidationCondition<T> {}

interface StringValidationSpec<T> extends LengthValidationSpec<T> {
  match(pattern: RegExp): StringValidationSpec2<T>;
}

interface StringValidationSpec2<T>
  extends StringValidationSpec<T>,
    ValidationCondition<T> {}

interface LengthValidationSpec<T> extends CommonValidationSpec<T> {
  beLongerThan(l: number): LengthValidationSpec2<T>;
  beShorterThan(l: number): LengthValidationSpec2<T>;
  haveLength(l: number): LengthValidationSpec2<T>;
}

interface LengthValidationSpec2<T>
  extends LengthValidationSpec<T>,
    ValidationCondition<T> {}

type ValidationSpec<T> = T extends number
  ? NumberValidationSpec<T>
  : T extends string
  ? StringValidationSpec<T>
  : T extends HasLegth
  ? LengthValidationSpec<T>
  : CommonValidationSpec<T>;

interface ValidationCondition<T> extends ValidationTermination<T> {
  when(condition: ValidCondition<T>): ValidationTermination<T>;
}

interface ValidationTermination<T> {
  orEmitError(message: string): void;
}

class ValidationSpecImp<T>
  implements
    CommonValidationSpec<T>,
    NumberValidationSpec<T>,
    StringValidationSpec<T>,
    ValidationTermination<T>
{
  constructor(
    protected complete: (v: ValidatorFn) => void,
    protected completeAsync: (v: AsyncValidatorFn) => void
  ) {}

  private currentValidator: ValidCondition<T>;
  private currentAsyncValidator: AsyncValidCondition<T>;

  private combine(c: ValidCondition<T>) {
    if (!!this.currentValidator) {
      const existingValidator = this.currentValidator;
      this.currentValidator = function (v) {
        return existingValidator(v) && c(v);
      };
    } else {
      this.currentValidator = c;
    }
    return this;
  }

  get notBeEmpty() {
    return this.combine(function (v) {
      return !!v;
    });
  }

  // Should be on a sub-object so it can't be invoked at the start
  when(condition: ValidCondition<T>) {
    // I think we don't want an arrow function, we don't want to capture `this`
    const existingValidator = this.currentValidator;
    this.currentValidator = function (v) {
      return condition(v) ? this.currentValidator : true;
    };
    return this;
  }

  match(regex: RegExp) {
    return this.combine(function (v) {
      return !v || !!v.toString().match(regex);
    });
  }

  satisfy(condition: ValidCondition<T>) {
    return this.combine(condition);
  }

  satisfyAsync(condition: AsyncValidCondition<T>) {
    this.currentAsyncValidator = condition;
    return this;
  }

  get beInteger() {
    return this.combine(function (v) {
      return (
        !v ||
        !(
          isNaN(v as unknown as number) ||
          parseInt(v.toString(), 10) !== parseFloat(v.toString())
        )
      );
    });
  }

  get beFloat() {
    return this.combine(function (v) {
      return !v || !isNaN(v as unknown as number);
    });
  }

  beLongerThan(l: number) {
    return this.combine(function (v) {
      return (v as unknown as HasLegth)?.length > l;
    });
  }

  beShorterThan(l: number) {
    return this.combine(function (v) {
      return (v as unknown as HasLegth)?.length < l;
    });
  }

  haveLength(l: number) {
    return this.combine(function (v) {
      return (v as unknown as HasLegth)?.length === l;
    });
  }

  orEmitError(message: string) {
    if (this.currentValidator) {
      const existingValidator = this.currentValidator;
      this.complete(function (c) {
        const ret = existingValidator(c.value) ? null : { error: message };
        return ret;
      });
    } else if (this.currentAsyncValidator) {
      const existingValidator = this.currentAsyncValidator;
      this.completeAsync(function (c) {
        return from(existingValidator(c.value)).pipe(
          map((ret) => (ret ? null : { error: message }))
        );
      });
    }
  }
}

function createValidations<T, G = T>(
  modelTypes: GroupModelTypeInfo<T>
): ModelValidation<T, G> {
  type P = T[keyof T];
  const validations: {
    [Key in keyof T]?:
      | Validation<P, T>
      | Array<Validation<ElementType<P>, Array<ElementType<P>>>>
      | ModelValidation<P, T>;
  } = {};
  for (const p of Object.keys(modelTypes)) {
    const prop = p as keyof T;
    const field = modelTypes[prop];
    if (isPrimitiveTypeInfo(field)) {
      validations[prop] = new ValidationImpl(field as TypeInfo<P>);
    } else if (Array.isArray(field)) {
      // Not handling nested (multi-dimensional) arrays. Because arrayField has no validation on its own and arrayField[0].group will always only validation one level up (the inner-most array)
      validations[prop] = [
        new ValidationImpl<ElementType<P>, Array<ElementType<P>>>(
          (field as Array<TypeInfo<ElementType<P>>>)[0]
        ),
      ];
    } else {
      validations[prop] = createValidations<P, T>(
        modelTypes[prop] as GroupModelTypeInfo<T[keyof T]>
      );
    }
  }
  return validations as ModelValidation<T, G>;
}

export function modelValidation<T>(
  types: ModelTypeInfo<T>,
  validations: (model: ModelValidation<T, T>) => void
): Model<T> {
  const validationSupport = createValidations(types as GroupModelTypeInfo<T>);
  validations(validationSupport);
  return new Model<T>(types, validationSupport);
}
