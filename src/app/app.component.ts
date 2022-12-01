import { Component, VERSION } from '@angular/core';
import { createFormGroup, FormControls } from './framework/forms';
import { ComplexType, Data, dataModel } from './model';
import { combineErrorsToObject } from './support';

@Component({
  selector: 'my-app',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  name = 'Angular ' + VERSION.major;

  form: FormControls<Data>;

  public allErrors() {
    return JSON.stringify(combineErrorsToObject(this.form));
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

    const c: ComplexType = { selfLink: 'fdasf', offset: 10 };

    const defValue: Data = {
      someInt: 23,
      someText: 'tty',
      opaqueType: c,
      //someDate: d2,
      innerObj: {
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
        //someDate: d,
        innerObj: {
          embedded: {
            anotherInt: 777,
          },
          intArray: [45, 123],
        },
      },
      dataModel
    );
    this.form = f2;
  }
}
