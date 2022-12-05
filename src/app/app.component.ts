import { Component, Pipe, PipeTransform, VERSION } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import {
  createFormGroup,
  EnchancedControl,
  FormControls,
} from './framework/forms';
import { ModelSpec, Spec, toSpec } from './framework/validation';
import { ComplexObject, ComplexType, Data, dataModel } from './model';
import { combineErrorsToObject } from './support';

@Pipe({ name: 'name' })
export class PropNamePipe implements PipeTransform {
  transform<T>(prop: ModelSpec<T>): string {
    return toSpec(prop).name;
  }
}

@Component({
  selector: 'my-app',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  name = 'Angular ' + VERSION.major;

  form: FormControls<Data>;
  model = dataModel;

  public allErrors() {
    return JSON.stringify(combineErrorsToObject(this.form), null, 2);
  }

  // TODO: Suboptimal due to kicking off change detection every time, this should be accessible normally, but I can't make a working `declare class AbstractControl`-like declaration to make TS understand there might be these properties on the objects.
  // TODO: Also it has an issue with the initial values not being refreshed.
  public isVisible(control: AbstractControl<unknown>) {
    return !(control as EnchancedControl).isHidden;
  }

  constructor() {
    console.log(JSON.stringify(dataModel, null, 2));
    // That's what you would normally do
    // const f = new FormGroup({
    //   someInt: new FormControl(123),
    //   someText: new FormControl('testing'),
    //   innerObj: new FormGroup({
    //     someBoolean: new FormControl(true),
    //     embedded: new FormGroup({
    //       anotherInt: new FormControl(456),
    //     }),
    //     intArray: new FormArray([new FormControl(999), new FormControl(15)]),
    //   }),
    // });
    // this.form = f;
    // let value: FormValue<typeof f>;
    // value = f.value;

    // Date needs a special case I think as I can't make a working `declare class Date` that tells TS it's a PrimitiveType
    const d: Date = new Date('1995-12-17T03:24:00');
    const d2 = new Date(Date.now());
    d2.getDay();

    const c: ComplexType = { selfLink: 'fdasf', offset: 10 };

    const defValue: Data = {
      someInt: 23,
      someText: 'tty',
      opaqueType: c,
      someClass: new ComplexObject('fadsf', { selfLink: 'jjl', offset: 123 }),
      //someDate: d2,
      innerObj: {
        hasEmbedded: true,
        embedded: {
          anotherInt: 777,
        },
        intArray: [45, 123],
      },
    };

    const f2 = createFormGroup(
      {
        someInt: 23,
        someText: 'tty',
        opaqueType: c,
        someClass: new ComplexObject('fadsf', { selfLink: 'jjl', offset: 123 }),
        //someDate: d,
        innerObj: {
          hasEmbedded: true,
          // embedded: {
          //   anotherInt: 777,
          // },
          intArray: [45, 123],
        },
      },
      dataModel
    );
    this.form = f2;

    //const v: Data = this.form.value;
  }

  public get formValue() {
    return JSON.stringify(this.form.value, null, 2);
  }
}

type AccessFn<T> = (obj: T) => T[keyof T];

function propName<T>(accessFn: AccessFn<T>): string;
function propName(accessFn: Function): string {
  return accessFn.toString().match(/\.([a-zA-Z0-9]+)/)![1];
}
