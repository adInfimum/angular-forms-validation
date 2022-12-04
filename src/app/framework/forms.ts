import { Pipe } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
} from '@angular/forms';
import { Observable, takeUntil } from 'rxjs';
import {
  ArrayType,
  ElementType,
  GroupType,
  isPrimitiveTypeInfo,
} from './types';
import {
  ArraySpec,
  CondFn,
  group,
  GroupSpec,
  Spec,
  SpecImpl,
  SpecMap,
} from './validation';

// Reactive forms support
export interface EnchancedControl {
  disabledTooltip?: string;
  isHidden?: boolean;
}

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
  if (scopeControls.size === 1) {
    // If there's only one scope, don't bother looking it up.
    scopeControls.values().next().value;
  }
  // If there's more (were in an array) go up the parent chain to get the related parent scope
  let c = controlToDisable;
  while (c) {
    if (scopeControls.has(c)) return c;
    c = c.parent;
  }
  // Give up, assert error or do a sophisticated lookup into the most related control :)
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

function setDisabled<T>(
  control: AbstractControl<T>,
  disabledTooltips: string[]
) {
  const disable = disabledTooltips.length > 0;
  if (disable) {
    (control as EnchancedControl).disabledTooltip = disabledTooltips.reduce(
      (p, t) => p || t
    );
    control.disable({ emitEvent: false });
  } else {
    (control as EnchancedControl).disabledTooltip = '';
    control.enable({ emitEvent: false });
  }
}

function hookUpHandler<T>(
  spec: SpecImpl<T>,
  controlMap: ControlMap,
  specMap: SpecMap,
  handler: (
    control: AbstractControl<T>,
    value: T,
    conditions: [CondFn<T>, string?][]
  ) => void,
  destroy?: DestroyObservable
) {
  const controlsToHandle = getControls(spec, controlMap);
  for (const scope of specMap.keys()) {
    const scopeControls = controlMap.get(scope);
    const conditions = specMap.get(scope);
    for (const toHandle of controlsToHandle) {
      const theScope = getParentScope(toHandle, scopeControls);
      if (!theScope) continue;
      console.log(
        `Hooking up handler to ${JSON.stringify(
          theScope.value
        )} control valueChanges`
      );
      valueChanges<T>(theScope, destroy).subscribe(function (value) {
        handler(toHandle, value, conditions as [CondFn<T>, string?][]);
      });
    }
  }
}

function hookUpDisable<T>(
  spec: SpecImpl<T>,
  controlMap: ControlMap,
  destroy?: DestroyObservable
) {
  hookUpHandler(
    spec,
    controlMap,
    spec.getDisablersMap(),
    function (control, value, disablers) {
      console.log(
        `Running value changes on ${value} to possibly disable the ${control.value} control`
      );
      const disableState = disablers
        .filter(function (d) {
          return d[0](value);
        })
        .map(function (d) {
          return d[1];
        });
      setDisabled(control, disableState);
    },
    destroy
  );
}

function hookUpHide<T>(
  spec: SpecImpl<T>,
  controlMap: ControlMap,
  destroy?: DestroyObservable
) {
  hookUpHandler(
    spec,
    controlMap,
    spec.getHidersMap(),
    function (control, value, hiders) {
      console.log(
        `Running value changes on ${value} to possibly hide the ${control.value} control`
      );
      const isHidden = hiders.map((h) => h[0](value)).reduce((p, c) => p || c);
      (control as EnchancedControl).isHidden = isHidden;
    },
    destroy
  );
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
  hookUpHide(spec as SpecImpl<T>, controlMap, destroy);
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
