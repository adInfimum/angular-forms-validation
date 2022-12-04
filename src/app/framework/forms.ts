import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
} from '@angular/forms';
import { Observable, takeUntil } from 'rxjs';
import {
  ArrayModelTypeInfo,
  ArrayType,
  ElementType,
  GroupType,
  isPrimitiveTypeInfo,
} from './types';
import {
  ArraySpec,
  group,
  GroupSpec,
  ModelSpec,
  Spec,
  SpecImpl,
} from './validation';

// Reactive forms support
export type DestroyObservable = Observable<unknown>;

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
  model: Spec<T>,
  controlMap?: ControlMap
): AbstractControl<ControlsInside<T>> {
  if (isPrimitiveTypeInfo(model.type)) {
    return createFormControlInternal<T>(
      value,
      model,
      controlMap
    ) as AbstractControl<T> as AbstractControl<ControlsInside<T>>;
  } else if ((model as unknown as ArraySpec<ElementType<T>>).element) {
    return createFormArrayInternal(
      value as unknown as ArrayType<T>,
      model as unknown as ArraySpec<ElementType<T>>,
      controlMap
    ) as AbstractControl<ControlsInsideArray<T>[]> as AbstractControl<
      ControlsInside<T>
    >;
  } else {
    return createFormGroupInternal(
      value,
      model as unknown as GroupSpec<T>,
      controlMap
    ) as AbstractControl<ControlsInsideGroup<T>> as AbstractControl<
      ControlsInside<T>
    >;
  }
}

function createFormControlInternal<T>(
  value: T,
  model: Spec<T>,
  controlMap?: ControlMap
): FormControl<T> {
  const spec = model as SpecImpl<T>;
  return addControl(
    new FormControl<T>(value, {
      validators: spec.getValidators(),
      asyncValidators: spec.getAsyncValidators(),
    }),
    spec,
    controlMap
  );
}

function propValue<T>(value: GroupType<T>, prop: keyof T): T[keyof T] {
  return !!value ? value[prop] : undefined;
}

function createFormGroupInternal<T extends GroupType<T>>(
  value: T,
  model: GroupSpec<T>,
  controlMap?: ControlMap
): FormGroup<ControlsInsideGroup<T>> {
  const controls: Partial<ControlsInsideGroup<T>> = {};
  for (const p of Object.keys(model)) {
    const prop = p as keyof T;
    controls[prop] = createAbstractControl(
      propValue(value, prop),
      model[prop] as Spec<T[keyof T]>,
      controlMap
    ) as FormControls<T[keyof T]>;
  }
  const spec = group(model) as SpecImpl<T>;
  return addControl(
    new FormGroup<ControlsInsideGroup<T>>(controls as ControlsInsideGroup<T>, {
      validators: spec.getValidators(),
      asyncValidators: spec.getAsyncValidators(),
    }),
    spec,
    controlMap
  );
}

function createFormArrayInternal<T extends ArrayType<T>>(
  value: T,
  model: ArraySpec<ElementType<T>>,
  controlMap?: ControlMap
): FormArray<ControlsInsideArray<T>> {
  const controls: ControlsInsideArray<T>[] = [];
  if (Array.isArray(value)) {
    for (const e of value) {
      controls.push(
        createAbstractControl(
          e,
          model.element,
          controlMap
        ) as ControlsInsideArray<T>
      );
    }
  }
  const spec = model as unknown as SpecImpl<T>;
  return addControl(
    new FormArray(controls, {
      validators: spec.getValidators(),
      asyncValidators: spec.getAsyncValidators(),
    }),
    spec,
    controlMap
  );
}

type ControlMap = Map<Spec<unknown>, Set<AbstractControl<unknown>>>;

function addControl<T, C extends AbstractControl<unknown>>(
  control: C,
  spec: Spec<T> | SpecImpl<T>,
  controlMap?: ControlMap
): C {
  if (!controlMap) return;
  const value = controlMap.get(spec as Spec<unknown>) || new Set();
  value.add(control as AbstractControl<unknown>);
  controlMap.set(spec as Spec<unknown>, value);
  return control;
}

function getControls<T>(
  spec: Spec<T> | SpecImpl<T>,
  controlMap: ControlMap
): Iterable<AbstractControl<T>> {
  const controlSet = controlMap.get(spec as Spec<unknown>);
  if (!controlSet) return [] as Iterable<AbstractControl<T>>;
  return controlSet.values() as Iterable<AbstractControl<T>>;
}

function getParentScope(
  controlToDisable: AbstractControl<unknown>,
  scopeControls: Set<AbstractControl<unknown>>
): AbstractControl<unknown> {
  let c = controlToDisable;
  while (c) {
    if (scopeControls.has(c)) return c;
    c = c.parent;
  }
  return null;
}

function valueChanges<T>(
  control: AbstractControl<unknown>,
  destroy?: DestroyObservable
): Observable<T> {
  return destroy
    ? (control as AbstractControl<T>).valueChanges.pipe(takeUntil(destroy))
    : (control as AbstractControl<T>).valueChanges;
}

function hookUpDisable<T>(
  spec: SpecImpl<T>,
  controlMap: ControlMap,
  destroy?: DestroyObservable
) {
  const controlsToDisable = getControls(spec, controlMap);
  const disablersMap = spec.getDisablersMap();
  for (const scope of disablersMap.keys()) {
    const scopeControls = controlMap.get(scope);
    const disablers = disablersMap.get(scope);
    for (const toDisable of controlsToDisable) {
      const theScope = getParentScope(toDisable, scopeControls);
      if (!theScope) continue;
      console.log(`Hooking up disables to ${theScope.value} control`);
      valueChanges<T>(theScope).subscribe(function (value) {
        console.log(
          `Running value changes on ${value} to possibly disable ${theScope.value} control`
        );
        const disable = disablers
          .map(function (d) {
            return d[0](value);
          })
          .reduce((p, c) => p || c, false);
        if (disable) {
          toDisable.disable({ emitEvent: false });
        } else {
          toDisable.enable({ emitEvent: false });
        }
      });
    }
  }
}

function hookUpControls<T>(
  spec: Spec<T>,
  controlMap: ControlMap,
  destroy?: DestroyObservable
) {
  console.log(
    `Hooking up observables for ${JSON.stringify(spec?.type)} controls`
  );
  hookUpDisable(spec as SpecImpl<T>, controlMap, destroy);
}

function hookUpObservables<T>(
  model: Spec<T>,
  controlMap: ControlMap,
  destroy?: DestroyObservable
) {
  if (isPrimitiveTypeInfo(model.type)) {
    hookUpControls(model, controlMap, destroy);
  } else if ((model as unknown as ArraySpec<ElementType<T>>).element) {
    hookUpControls(model, controlMap, destroy);
    const elementModel = (model as unknown as ArraySpec<ElementType<T>>)
      .element;
    hookUpObservables(elementModel, controlMap, destroy);
  } else {
    const spec = group(model as unknown as GroupSpec<T>) as SpecImpl<T>;
    hookUpControls(spec, controlMap, destroy);
    for (const p of Object.keys(model)) {
      type P = T[keyof T];
      const prop = p as keyof Spec<T>;
      console.log(`Hooking up sub field ${prop}`);
      hookUpObservables(
        model[prop] as unknown as SpecImpl<P>,
        controlMap,
        destroy
      );
    }
  }
}

export function createFormControl<T>(
  value: T,
  model: Spec<T>,
  destroy?: DestroyObservable
): FormControl<T> {
  const controlMap: ControlMap = new Map();
  const control = createFormControlInternal(value, model, controlMap);
  hookUpObservables(model, controlMap, destroy);
  return control;
}

export function createFormGroup<T extends GroupType<T>>(
  value: T,
  model: GroupSpec<T>,
  destroy?: DestroyObservable
): FormGroup<ControlsInsideGroup<T>> {
  const controlMap: ControlMap = new Map();
  const control = createFormGroupInternal(value, model, controlMap);
  hookUpObservables(model as unknown as Spec<T>, controlMap, destroy);
  return control;
}

export function createFormArray<T extends ArrayType<T>>(
  value: T,
  model: ArraySpec<ElementType<T>>,
  destroy?: DestroyObservable
): FormArray<ControlsInsideArray<T>> {
  const controlMap: ControlMap = new Map();
  const control = createFormArrayInternal(value, model, controlMap);
  hookUpObservables(model, controlMap, destroy);
  return control;
}
