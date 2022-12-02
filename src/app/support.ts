import {
  AbstractControl,
  UntypedFormGroup,
  ValidationErrors,
} from '@angular/forms';

//combine errors
export function combineErrorsToObject(
  control: AbstractControl | UntypedFormGroup
): ValidationErrors {
  return Object.assign(
    thisControlErrors(control),
    isFormGroup(control) ? childErrors(control) : {}
  );
}

function childErrors(group: UntypedFormGroup): ValidationErrors {
  const errors = Object.keys(group.controls)
    .map((name) => {
      const e = combineErrorsToObject(group.controls[name]);
      return emptyErrors(e) ? {} : { [name]: e };
    })
    .reduce((all, err) => Object.assign(all, err), {});
  return errors;
}

function isFormGroup(
  control: AbstractControl | UntypedFormGroup
): control is UntypedFormGroup {
  return !!(control as UntypedFormGroup).controls;
}

function thisControlErrors(control: AbstractControl): ValidationErrors {
  return emptyErrors(control.errors) ? {} : { ...control.errors };
}

function emptyErrors(errors: ValidationErrors | null): errors is null {
  return !errors || Object.keys(errors).length < 1;
}
