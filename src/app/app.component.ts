import { Component, Pipe, PipeTransform, VERSION } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import {
  createFormGroup,
  EnchancedControl,
  FormControls,
} from './framework/forms';
import { ModelTypeInfo } from './framework/types';
import { ComplexObject, ComplexType, Data, dataModel } from './model';
import { combineErrorsToObject } from './support';

@Pipe({ name: 'isVisible' })
export class VisiblePipe implements PipeTransform {
  transform(control: AbstractControl<unknown>): boolean {
    return !(control as EnchancedControl).isHidden;
  }
}

@Pipe({ name: 'disableTooltip' })
export class TooltipPipe implements PipeTransform {
  transform(control: AbstractControl<unknown>): string {
    return (control as EnchancedControl).disabledTooltip || '';
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

  public allErrors() {
    return JSON.stringify(combineErrorsToObject(this.form), null, 2);
  }

  public isVisible(control: AbstractControl<unknown>) {
    return !(control as EnchancedControl).isHidden;
  }

  constructor() {
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
