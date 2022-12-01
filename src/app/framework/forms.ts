import {
  AbstractControl,
  AsyncValidatorFn,
  FormArray,
  FormControl,
  FormGroup,
  ValidatorFn,
} from '@angular/forms';
import { Model, Validation, ValidationImpl } from './validation';
import { ElementType, isPrimitiveTypeInfo } from './types';

// Reactive forms support
export type FormControls<T> = T extends {}
  ? FormGroup<ControlsInsideGroup<T>>
  : T extends Array<infer E>
  ? FormArray<FormControls<E>>
  : FormControl<T>;

type ControlsInsideGroup<T> = {
  -readonly [Key in keyof T]-?: FormControls<T[Key]>;
};

type ControlsInsideArray<T> = FormControl<ElementType<T>>;

type ControlsInside<T> = T extends {}
  ? ControlsInsideGroup<T>
  : T extends Array<infer E>
  ? ControlsInsideArray<T>[]
  : T;

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
    ElementType<T>,
    T
  >;
  return new FormArray(controls, {
    validators: fieldValidation.groupValidators,
    asyncValidators: fieldValidation.asyncGroupValidators,
  });
}
