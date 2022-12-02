import { interval } from 'rxjs';
import { first, map } from 'rxjs/operators';
import { ModelTypeInfo, PrimitiveType, Types } from './framework/types';
import { modelValidation } from './framework/validation';

// Suport Date as a first-class value in forms
//declare interface Date extends PrimitiveType {}
// Apparently Date is special enough that it has to handled natively in the lib

export interface ComplexType {
  selfLink: string;
  offset: number;
}

export class ComplexObject {
  constructor(public name: string, public data: ComplexType) {}

  public represent() {
    return this.name;
  }
}

export declare interface ComplexType extends PrimitiveType {}

export declare interface ComplexObject extends PrimitiveType {}

export interface Data {
  someInt: number;
  someText: string;
  opaqueType: ComplexType;
  someClass: ComplexObject;
  //someDate: Date;
  innerObj: {
    hasEmbedded: boolean;
    embedded?: {
      anotherInt: number;
    };
    intArray: number[];
  };
}

export const dataModel = modelValidation<Data>(
  {
    someInt: Types.int,
    opaqueType: Types.opaque<ComplexType>('complexType'),
    someText: Types.string,
    someClass: Types.opaque<ComplexObject>('complexObject'),
    //someDate: Types.opaque<Date>('date'),
    innerObj: {
      hasEmbedded: Types.boolean,
      embedded: { anotherInt: Types.int },
      intArray: [Types.int],
    },
  },
  (m) => {
    m.someInt.should.beInteger.notBeEmpty.orEmitError(
      'The int field is a must!'
    );
    m.someInt.should
      .satisfyAsync((v) =>
        interval(500).pipe(
          first(),
          map(() => v > 100)
        )
      )
      .orEmitError('Async validation failed');
    m.opaqueType.should.notBeEmpty.orEmitError(
      'Has to have this silly complex value too'
    );
    m.innerObj.hasEmbedded.group.should
      .satisfy(
        (innerObj) =>
          !innerObj.hasEmbedded ||
          (!!innerObj.embedded && innerObj.embedded.anotherInt > 0)
      )
      .orEmitError(
        'If hasEmbedded is true, there needs to be an embedded object!'
      );
    m.innerObj.intArray[0].should
      .satisfy((v) => v >= 0 && v <= 100)
      .orEmitError('The array elements are percentages, duh!');
    m.someText.should.match(/^A/).orEmitError("This needs to start with 'A'.");
    m.someText.should.notBeEmpty.orEmitError('The string is necessary');
  }
);
