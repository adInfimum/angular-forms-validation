import { interval } from 'rxjs';
import { first, map } from 'rxjs/operators';
import { PrimitiveType, Types } from './framework/types';
import { group, ceateModel } from './framework/validation';

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

export const dataModel = ceateModel<Data>(
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
    m.someInt.should(
      (x) =>
        x &&
        x.toString().length > 0 &&
        !isNaN(x) &&
        parseInt(x.toString(), 10) == parseFloat(x.toString()),
      'The int field is a must!'
    );
    m.someInt.shouldAsync(
      (v) =>
        interval(500).pipe(
          first(),
          map(() => v > 100)
        ),
      'Async validation failed'
    );
    m.opaqueType.should((x) => !!x, 'Has to have this silly complex value too');
    //group(m.innerObj.hasEmbedded); // This is an error since it's not a GroupSpec<T>
    group(m.innerObj).should(
      (innerObj) =>
        !innerObj.hasEmbedded ||
        (!!innerObj.embedded && innerObj.embedded.anotherInt > 0),
      'If hasEmbedded is true, there needs to be an embedded object!'
    );
    group(m.innerObj.embedded).disableIf(
      m.innerObj,
      (v) => !v.hasEmbedded,
      "Not needed if it doesn't have an embedded object"
    );
    m.innerObj.intArray.element.should(
      (v) => v >= 0 && v <= 100,
      'The array elements are percentages, duh!'
    );
    m.innerObj.intArray.hideIf(m.innerObj, (v) => v.hasEmbedded);
    m.someText.should((x) => !!x.match(/^A/), "This needs to start with 'A'.");
    m.someText.should((x) => !!x, 'The string is necessary');
  }
);
