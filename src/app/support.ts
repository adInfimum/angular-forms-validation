import {
  AbstractControl,
  UntypedFormGroup,
  ValidationErrors,
} from '@angular/forms';

//combine errors
export function combineErrorsToObject(
  control: AbstractControl | UntypedFormGroup,
  propName?: string
): ValidationErrors {
  return Object.assign(
    thisControlErrors(control, propName),
    isFormGroup(control) ? childErrors(control) : {}
  );
}

function childErrors(group: UntypedFormGroup): ValidationErrors {
  return Object.keys(group.controls)
    .map((name) => combineErrorsToObject(group.controls[name], name))
    .reduce((all, err) => Object.assign(all, err), {});
}

function isFormGroup(
  control: AbstractControl | UntypedFormGroup
): control is UntypedFormGroup {
  return !!(control as UntypedFormGroup).controls;
}

function thisControlErrors(
  control: AbstractControl,
  propName?: string
): ValidationErrors {
  if (emptyErrors(control.errors)) return {};
  return propName
    ? { [propName]: { ...control.errors } }
    : { ...control.errors };
}

function emptyErrors(errors: ValidationErrors | null): errors is null {
  return !errors || Object.keys(errors).length < 1;
}
