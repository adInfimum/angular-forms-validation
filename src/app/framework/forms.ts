import {
  AbstractControl,
  AsyncValidatorFn,
  FormArray,
  FormControl,
  FormGroup,
  ValidatorFn,
} from '@angular/forms';
import {
  Model,
  Validation,
  ValidationImpl,
  ValidCondition,
} from './validation';
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
  model: Model<T>
): AbstractControl<ControlsInside<T>> {
  if (isPrimitiveTypeInfo(model.types)) {
    return createFormControl<T>(
      value,
      model
    ) as AbstractControl<T> as AbstractControl<ControlsInside<T>>;
  } else if (Array.isArray(model.types)) {
    return createFormArray(
      value as unknown as ArrayType<T>,
      model as unknown as Model<ArrayType<T>>
    ) as AbstractControl<ControlsInsideArray<T>[]> as AbstractControl<
      ControlsInside<T>
    >;
  } else {
    return createFormGroup(value, model) as AbstractControl<
      ControlsInsideGroup<T>
    > as AbstractControl<ControlsInside<T>>;
  }
}

export function createFormControl<T>(
  value: T,
  model: Model<T>
): FormControl<T> {
  const fieldValidation = model.validations as unknown as ValidationImpl<T, T>;
  return new FormControl<T>(value, {
    validators: fieldValidation.validators,
    asyncValidators: fieldValidation.asyncValidators,
  });
}

type GroupType<T> = {
  [Key in keyof T]: T[Key];
};

type ArrayType<T> = ElementType<T>[];

function propValue<T>(value: GroupType<T>, prop: keyof T): T[keyof T] {
  return !!value ? value[prop] : undefined;
}

export function createFormGroup<T extends GroupType<T>>(
  value: T,
  model: Model<T>
): FormGroup<ControlsInsideGroup<T>> {
  const controls: Partial<ControlsInsideGroup<T>> = {};
  for (const p of Object.keys(model.types)) {
    const prop = p as keyof T;
    const v = propValue(value, prop);
    controls[prop] = createAbstractControl(
      propValue(value, prop),
      model.subModel((m) => m[prop])
    ) as FormControls<T[keyof T]>;
    // TODO: add group validations back
  }
  return new FormGroup<ControlsInsideGroup<T>>(
    controls as ControlsInsideGroup<T>
  );
}

export function createFormArray<T extends ArrayType<T>>(
  value: T,
  model: Model<ArrayType<T>>
): FormArray<ControlsInsideArray<T>> {
  const arrayModel = model.subModel((m) => m[0]);
  const controls: ControlsInsideArray<T>[] = [];
  if (Array.isArray(value)) {
    for (const e of value) {
      controls.push(
        createAbstractControl(e, arrayModel) as ControlsInsideArray<T>
      );
    }
  }
  const fieldValidation = arrayModel.validations as unknown as ValidationImpl<
    ElementType<T>,
    T
  >;
  return new FormArray(controls, {
    validators: fieldValidation.groupValidators,
    asyncValidators: fieldValidation.asyncGroupValidators,
  });
}
