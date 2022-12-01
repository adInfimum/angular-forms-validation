import { Component, VERSION } from '@angular/core';
import {
  createFormGroup,
  FormControls,
  modelValidation,
  Types,
} from './framework';
import { combineErrorsToObject } from './support';

interface Data {
  someInt: number;
  someText: string;
  innerObj: {
    someBoolean?: boolean;
    embedded: {
      anotherInt: number;
    };
    intArray: number[];
  };
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

    const model = modelValidation<Data>(
      {
        someInt: Types.int,
        someText: Types.string,
        innerObj: {
          someBoolean: Types.boolean,
          embedded: { anotherInt: Types.int },
          intArray: [Types.int],
        },
      },
      (m) => {
        m.someInt.should.beInteger.notBeEmpty.orEmitError(
          'The int field is a must!'
        );
        m.innerObj.intArray[0].should
          .satisfy((v) => v >= 0 && v <= 100)
          .orEmitError('The array elements are percentages, duh!');
        m.someText.should
          .match(/^A/)
          .orEmitError("This needs to start with 'A'.");
        m.someText.should.notBeEmpty.orEmitError('The string is necessary');
      }
    );
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
      model
    );
    this.form = f2;
  }
}
