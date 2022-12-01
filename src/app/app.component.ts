import { Component, VERSION } from '@angular/core';
import { createFormGroup, FormControls } from './framework/forms';
import { Data, dataModel } from './model';
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

    const f2 = createFormGroup(
      {
        someInt: 23,
        someText: 'tty',
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
