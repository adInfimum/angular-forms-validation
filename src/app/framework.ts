import { group } from '@angular/animations';
import {
  AbstractControl,
  AsyncValidatorFn,
  FormArray,
  FormControl,
  FormGroup,
  UntypedFormControl,
  ValidatorFn,
} from '@angular/forms';
import { firstValueFrom, map, Observable, of } from 'rxjs';

// Model typings
class TypeInfo<T> {
  private dummyValue: T; // This is to make TS show errors if we want to assign an incompatible type for a model field
  constructor(public readonly typeid: string) {}
}

function isPrimitiveTypeInfo(x: any, v?: any): x is TypeInfo<any> {
  return !!x.typeid;
}

function assertType<T>(x: any): x is T {
  return true;
}

type ModelTypeInfo<T> = T extends boolean
  ? TypeInfo<boolean>
  : T extends number
  ? TypeInfo<number>
  : T extends string
  ? TypeInfo<string>
  : T extends Array<infer E>
  ? Array<ModelTypeInfo<E>>
  : {
      -readonly [Key in keyof T]-?: ModelTypeInfo<T[Key]>;
    };

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

// Model and validations
class Model<T> {
  constructor(
    public readonly types: ModelTypeInfo<T>,
    public readonly validations: ModelValidation<T, T>
  ) {}

  public subModel<E>(
    accessor: (m: ModelTypeInfo<T>) => ModelTypeInfo<E>
  ): Model<E> {
    const specAccessor = accessor as unknown as (
      m: ModelValidation<T, T>
    ) => ModelValidation<E, E>;
    return new Model(accessor(this.types), specAccessor(this.validations));
  }
}

type ModelValidation<T, G> = T extends boolean
  ? Validation<boolean, G>
  : T extends number
  ? Validation<number, G>
  : T extends string
  ? Validation<string, G>
  : T extends Array<infer E>
  ? Array<ModelValidation<E, Array<E>>>
  : {
      -readonly [Key in keyof T]-?: ModelValidation<T[Key], T>;
    };

type AnyValidatorFn = ValidatorFn | AsyncValidatorFn;

interface Validation<T, G> extends ValidationSpecStart<T> {
  get group(): ValidationSpecStart<G>;
}

class ValidationImpl<T, G> implements Validation<T, G> {
  validators: ValidatorFn[] = [];
  asyncValidators: AsyncValidatorFn[] = [];
  groupValidators: ValidatorFn[] = [];
  asyncGroupValidators: AsyncValidatorFn[] = [];

  constructor(readonly typeInfo: TypeInfo<T>) {}

  public get should() {
    return new ValidationSpecImp<T>(
      (v) => this.validators.push(v),
      (v) => this.asyncValidators.push(v)
    ) as unknown as ValidationSpec<T>;
  }

  public get group() {
    return {
      should: new ValidationSpecImp<G>(
        (v) => this.groupValidators.push(v),
        (v) => this.asyncGroupValidators.push(v)
      ) as unknown as ValidationSpec<G>,
    };
  }
}

type ValidCondition<T> = (value: T) => boolean;
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
  : {};

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

  public get notBeEmpty() {
    return this.combine(function (v) {
      return !!v;
    });
  }

  // Should be on a sub-object so it can't be invoked at the start
  public when(condition: ValidCondition<T>) {
    // I think we don't want an arrow function, we don't want to capture `this`
    const existingValidator = this.currentValidator;
    this.currentValidator = function (v) {
      return condition(v) ? this.currentValidator : true;
    };
    return this;
  }

  public match(regex: RegExp) {
    return this.combine(function (v) {
      return !v || !!v.toString().match(regex);
    });
  }

  public satisfy(condition: ValidCondition<T>) {
    return this.combine(condition);
  }

  public satisfyAsync(condition: AsyncValidCondition<T>) {
    this.currentAsyncValidator = condition;
    return this;
  }

  public get beInteger() {
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

  public get beFloat() {
    return this.combine(function (v) {
      return !v || !isNaN(v as unknown as number);
    });
  }

  public beLongerThan(l: number) {
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

  public orEmitError(message: string) {
    if (this.currentValidator) {
      const existingValidator = this.currentValidator;
      this.complete(function (c) {
        return existingValidator(c.value) ? null : { error: message };
      });
    } else {
      const existingValidator = this.currentValidator;
      this.completeAsync(async function (c) {
        return of(existingValidator(c.value)).pipe(
          map((ret) => (ret ? null : { error: message }))
        );
      });
    }
  }
}

function createValidations<T>(
  modelTypes: ModelTypeInfo<T>
): ModelValidation<T, T> {
  const validations = {};
  for (const prop of Object.keys(modelTypes)) {
    const field = modelTypes[prop];
    if (isPrimitiveTypeInfo(field)) {
      switch (field.typeid) {
        case 'int':
        case 'float':
          validations[prop] = new ValidationImpl<number, T>(field);
          break;
        case 'string':
          validations[prop] = new ValidationImpl<string, T>(field);
          break;
        case 'boolean':
          validations[prop] = new ValidationImpl<boolean, T>(field);
          break;
      }
    } else if (Array.isArray(field)) {
      // Not handling nested (multi-dimensional) arrays. Because arrayField has no validation on its own and arrayField[0].group will always only validation one level up (the inner-most array)
      validations[prop] = [
        createValidations({ field: modelTypes[prop][0] }).field,
      ];
    } else {
      validations[prop] = createValidations(modelTypes[prop]);
    }
  }
  return validations as ModelValidation<T, T>;
}

export function modelValidation<T>(
  types: ModelTypeInfo<T>,
  validations: (model: ModelValidation<T, T>) => void
): Model<T> {
  const validationSupport = createValidations(types);
  validations(validationSupport);
  return new Model<T>(types, validationSupport);
}

// Reactive forms support
export type FormControls<T> = T extends boolean
  ? FormControl<boolean>
  : T extends number
  ? FormControl<number>
  : T extends string
  ? FormControl<string>
  : T extends Array<infer E>
  ? FormArray<FormControls<E>>
  : FormGroup<{
      -readonly [Key in keyof T]-?: FormControls<T[Key]>;
    }>;

type ControlsInsideGroup<T> = {
  -readonly [Key in keyof T]-?: FormControls<T[Key]>;
};

type ControlsInsideArray<T> = FormControl<ElementyType<T>>;

type ControlsInside<T> = T extends {}
  ? ControlsInsideGroup<T>
  : T extends Array<infer E>
  ? ControlsInsideArray<T>[]
  : T;

type ElementyType<T> = T extends Array<infer E> ? E : never;

function createAbstractControl<T>(
  value: T,
  model: Model<T>,
  groupValidators?: ValidatorFn[],
  asyncGroupValidators?: AsyncValidatorFn[]
): AbstractControl<ControlsInside<T>> {
  if (isPrimitiveTypeInfo(model.types)) {
    return createFormControl<T>(
      value,
      model,
      groupValidators,
      asyncGroupValidators
    ) as AbstractControl<T> as AbstractControl<ControlsInside<T>>;
  } else if (Array.isArray(model.types)) {
    return createFormArray(
      value,
      model,
      groupValidators,
      asyncGroupValidators
    ) as AbstractControl<ControlsInsideArray<T>[]> as AbstractControl<
      ControlsInside<T>
    >;
  } else {
    return createFormGroup(
      value,
      model,
      groupValidators,
      asyncGroupValidators
    ) as AbstractControl<ControlsInsideGroup<T>> as AbstractControl<
      ControlsInside<T>
    >;
  }
}

export function createFormControl<T>(
  value: T,
  model: Model<T>,
  groupValidators?: ValidatorFn[],
  asyncGroupValidators?: AsyncValidatorFn[]
): FormControl<T> {
  const fieldValidation = model.validations as unknown as ValidationImpl<T, T>;
  if (Array.isArray(groupValidators)) {
    groupValidators.push(...fieldValidation.groupValidators);
  }
  if (Array.isArray(asyncGroupValidators)) {
    asyncGroupValidators.push(...fieldValidation.asyncGroupValidators);
  }
  return new FormControl<T>(value, {
    validators: fieldValidation.validators,
    asyncValidators: fieldValidation.asyncValidators,
  });
}

export function createFormGroup<T>(
  value: T,
  model: Model<T>,
  externalGroupValidators?: ValidatorFn[],
  externalAsyncGroupValidators?: AsyncValidatorFn[]
): FormGroup<ControlsInsideGroup<T>> {
  const controls = {};
  const groupValidators = [];
  const asyncGroupValidators = [];
  for (const prop of Object.keys(model.types)) {
    const field = model.types[prop];
    if (isPrimitiveTypeInfo(field)) {
      controls[prop] = createFormControl(
        value[prop],
        model.subModel((m) => m[prop]),
        groupValidators,
        asyncGroupValidators
      );
    } else if (Array.isArray(field)) {
      controls[prop] = createFormArray(
        value[prop],
        model.subModel((m) => m[prop])
      );
    } else {
      controls[prop] = createFormGroup(
        value[prop],
        model.subModel((m) => m[prop])
      );
    }
  }
  return new FormGroup<ControlsInsideGroup<T>>(
    controls as ControlsInsideGroup<T>,
    { validators: groupValidators, asyncValidators: asyncGroupValidators }
  );
}

export function createFormArray<T>(
  value: T,
  model: Model<T>,
  externalGroupValidators?: ValidatorFn[],
  externalAsyncGroupValidators?: AsyncValidatorFn[]
): FormArray<ControlsInsideArray<T>> {
  const arrayModel = model.subModel((m) => m[0]);
  const controls = [];
  if (Array.isArray(value)) {
    for (const e of value) {
      controls.push(createAbstractControl(e, arrayModel));
    }
  }
  const fieldValidation = arrayModel.validations as ValidationImpl<
    ElementyType<T>,
    T
  >;
  return new FormArray(controls, {
    validators: fieldValidation.groupValidators,
    asyncValidators: fieldValidation.asyncGroupValidators,
  });
}
