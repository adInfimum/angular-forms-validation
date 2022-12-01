import { Types } from './framework/types';
import { modelValidation } from './framework/validation';

export interface Data {
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

export const dataModel = modelValidation<Data>(
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
    m.someText.should.match(/^A/).orEmitError("This needs to start with 'A'.");
    m.someText.should.notBeEmpty.orEmitError('The string is necessary');
  }
);
