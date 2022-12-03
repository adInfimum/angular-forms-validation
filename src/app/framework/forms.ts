import {
  AbstractControl,
  AsyncValidatorFn,
  FormArray,
  FormControl,
  FormGroup,
  ValidatorFn,
} from '@angular/forms';
import { ArrayModelTypeInfo, ElementType, isPrimitiveTypeInfo } from './types';
import {
  ArraySpec,
  group,
  GroupSpec,
  ModelSpec,
  Spec,
  SpecImpl,
} from './validation';

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
  model: Spec<T>
): AbstractControl<ControlsInside<T>> {
  if (isPrimitiveTypeInfo(model.type)) {
    return createFormControl<T>(
      value,
      model
    ) as AbstractControl<T> as AbstractControl<ControlsInside<T>>;
  } else if ((model as unknown as ArraySpec<ElementType<T>>).element) {
    return createFormArray(
      value as unknown as ArrayType<T>,
      model as unknown as ArraySpec<ElementType<T>>
    ) as AbstractControl<ControlsInsideArray<T>[]> as AbstractControl<
      ControlsInside<T>
    >;
  } else {
    return createFormGroup(
      value,
      model as unknown as GroupSpec<T>
    ) as AbstractControl<ControlsInsideGroup<T>> as AbstractControl<
      ControlsInside<T>
    >;
  }
}

export function createFormControl<T>(value: T, model: Spec<T>): FormControl<T> {
  const spec = model as SpecImpl<T>;
  return new FormControl<T>(value, {
    validators: spec.getValidators(),
    asyncValidators: spec.getAsyncValidators(),
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
  model: GroupSpec<T>
): FormGroup<ControlsInsideGroup<T>> {
  const controls: Partial<ControlsInsideGroup<T>> = {};
  for (const p of Object.keys(model)) {
    const prop = p as keyof T;
    controls[prop] = createAbstractControl(
      propValue(value, prop),
      model[prop] as Spec<T[keyof T]>
    ) as FormControls<T[keyof T]>;
    // TODO: add group validations back
  }
  const spec = group(model) as SpecImpl<T>;
  return new FormGroup<ControlsInsideGroup<T>>(
    controls as ControlsInsideGroup<T>,
    {
      validators: spec.getValidators(),
      asyncValidators: spec.getAsyncValidators(),
    }
  );
}

export function createFormArray<T extends ArrayType<T>>(
  value: T,
  model: ArraySpec<ElementType<T>>
): FormArray<ControlsInsideArray<T>> {
  const controls: ControlsInsideArray<T>[] = [];
  if (Array.isArray(value)) {
    for (const e of value) {
      controls.push(
        createAbstractControl(e, model.element) as ControlsInsideArray<T>
      );
    }
  }
  const spec = model as unknown as SpecImpl<T>;
  return new FormArray(controls, {
    validators: spec.getValidators(),
    asyncValidators: spec.getAsyncValidators(),
  });
}
