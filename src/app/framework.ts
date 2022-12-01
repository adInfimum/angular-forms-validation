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

function isPrimitiveTypeInfo(x: any): x is TypeInfo<any> {
  return !!x.typeid;
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

  public subModel<E>(accessor: (m: ModelTypeInfo<T>) => ModelTypeInfo<E>): Model<E> {
    const specAccessor = accessor as unknown as (m: ModelValidation<T, T>) => ModelValidation<E, E>;
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

class Validation<T, G> implements ValidationSpecStart<T> {
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

  public get group(): ValidationSpecStart<G> {
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
  get notBeEmpty(): ValidationConditions<T>;
  satisfy(condition: ValidCondition<T>): ValidationConditions<T>;
  satisfyAsync(condition: AsyncValidCondition<T>): ValidationConditions<T>;
}

interface NumberValidationSpec<T> {
  get beInteger(): ValidationConditions<T>;
  get beFloat(): ValidationConditions<T>;
}

interface StringValidationSpec<T> extends LengthValidationSpec<T> {
  match(pattern: RegExp): ValidationConditions<T>;
}

interface LengthValidationSpec<T> {
  beLongerThan(l: number): ValidationConditions<T>;
  beShorterThan(l: number): ValidationConditions<T>;
  haveLength(l: number): ValidationConditions<T>;
}

type ValidationSpec<T> = CommonValidationSpec<T> &
  (T extends number
    ? NumberValidationSpec<T>
    : T extends string
    ? StringValidationSpec<T>
    : T extends HasLegth
    ? LengthValidationSpec<T>
    : {});

interface ValidationConditions<T> extends ValidationTermination<T> {
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
    ValidationConditions<T>,
    ValidationTermination<T>
{
  constructor(
    protected complete: (v: ValidatorFn) => void,
    protected completeAsync: (v: AsyncValidatorFn) => void
  ) {}

  private currentValidator: ValidCondition<T>;
  private currentAsyncValidator: AsyncValidCondition<T>;

  public get notBeEmpty() {
    this.currentValidator = function (v) {
      return !!v;
    };
    return this;
  }

  // Should be on a sub-object so it can't be invoked at the start
  public when(condition: ValidCondition<T>) {
    // I think we don't want an arrow function, we don't want to capture `this`
    const existingValidator = this.currentValidator;
    this.currentValidator = function (v) {
      return condition(v) || this.currentValidator;
    };
    return this;
  }

  public match(regex: RegExp) {
    this.currentValidator = function (v) {
      return !v || !!v.toString().match(regex);
    };
    return this;
  }

  public satisfy(condition: ValidCondition<T>) {
    this.currentValidator = condition;
    return this;
  }

  public satisfyAsync(condition: AsyncValidCondition<T>) {
    this.currentAsyncValidator = condition;
    return this;
  }

  public get beInteger() {
    this.currentValidator = function (v) {
      return !v || !isNaN(parseInt(v.toString(), 10));
    };
    return this;
  }

  public get beFloat() {
    this.currentValidator = function (v) {
      return !v || !isNaN(parseFloat(v.toString()));
    };
    return this;
  }

  public beLongerThan(l: number) {
    this.currentValidator = function (v) {
      return (v as unknown as HasLegth)?.length > l;
    };
    return this;
  }

  beShorterThan(l: number) {
    this.currentValidator = function (v) {
      return (v as unknown as HasLegth)?.length < l;
    };
    return this;
  }

  haveLength(l: number) {
    this.currentValidator = function (v) {
      return (v as unknown as HasLegth)?.length === l;
    };
    return this;
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
          validations[prop] = new Validation<number, T>(field);
          break;
        case 'string':
          validations[prop] = new Validation<string, T>(field);
          break;
        case 'boolean':
          validations[prop] = new Validation<boolean, T>(field);
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

type ControlsInside<T> = {
  -readonly [Key in keyof T]-?: FormControls<T[Key]>;
};

export function createFormControl<T>(value: T, model: Model<T>): FormControl<T> {
  const fieldValidation = model.validations as unknown as Validation<T, T>;
  return new FormControl<T>(value, {
    validators: fieldValidation.validators,
    asyncValidators: fieldValidation.asyncValidators,
  });
}

export function createFormGroup<T>(
  value: T,
  model: Model<T>
): FormGroup<ControlsInside<T>> {
  const controls = {};
  const groupValidators = [];
  const asyncGroupValidator = [];
  for (const prop of Object.keys(model.types)) {
    const field = model.types[prop];
    if (isPrimitiveTypeInfo(field)) {
      const fieldValidation = model.validations[prop] as Validation<number|string|boolean, T>;
      controls[prop] = createFormControl(value[prop], model.subModel(m => m[prop]));
      groupValidators.push(...fieldValidation.groupValidators);
      asyncGroupValidator.push(...fieldValidation.asyncGroupValidators);
      // switch (field.typeid) {
      //   case 'int':
      //   case 'float':
      //     const fieldValidation = model.validations[prop] as Validation<number, T>;
      //     controls[prop] = new FormControl<number>(value[prop], {
      //       validators: fieldValidation.validators,
      //       asyncValidators: fieldValidation.asyncValidators,
      //     });
      //     groupValidators.push(...fieldValidation.groupValidators);
      //     asyncGroupValidator.push(...fieldValidation.asyncGroupValidators);
      //     break;
      //   case 'string':
      //     controls[prop] = new FormControl<string>(
      //       value[prop],
      //       model.validations[prop]
      //     );
      //     break;
      //   case 'boolean':
      //     controls[prop] = new FormControl<boolean>(
      //       value[prop],
      //       model.validations[prop]
      //     );
      //     break;
      // }
    } else if (Array.isArray(field)) {
      const fieldValidation = model.validations[prop][0] as Validation<{}, Array<{}>>;
      const dummy = createFormGroup(
        value[prop],
        new Model<{field: {}}>(
          { field: fieldValidation.typeInfo},
          { field: fieldValidation }
        )
      );
      const control = dummy.controls.field;
      dummy.removeControl(control); // I don't want some crap registered to the dummy group leaking any memory
      controls[prop] = new FormArray<any>([control]);
    } else {
      controls[prop] = createFormGroup(
        value[prop],
        new Model(model.types[prop], model.validations[prop])
      );
    }
  }
  return new FormGroup<ControlsInside<T>>(controls as ControlsInside<T>);
}

export function createFormArray<V>(
  value: V[],
  model: Model<V[]>
): FormArray<FormControls<V>> {
  const fieldValidation = model.validations[0];
  const controls = [];
  for (const e of value) {

  }
  const dummy = createFormGroup(
    value[prop],
    new Model<{field: {}}>(
      { field: fieldValidation.typeInfo},
      { field: fieldValidation }
    )
  );
  const control = dummy.controls.field;
  dummy.removeControl(control); // I don't want some crap registered to the dummy group leaking any memory
  controls[prop] = new FormArray<any>([control]);
}
