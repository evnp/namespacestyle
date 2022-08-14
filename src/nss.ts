export type NSS<NameEnum, ElemEnum, CondEnum> = {
  [key in keyof NameEnum]: NSSBaseFunc<ElemEnum, CondEnum>;
} & {
  mapClasses: () => NSS<NameEnum, ElemEnum, CondEnum>;
} & NSSBaseFunc<ElemEnum, CondEnum>;

export type NSSObject = {
  __nss__: boolean;
  name: string;
  class: string;
  c: string;
  string: string;
  s: string;
  toString: () => string;
};

export type NSSBase<ElemEnum, CondEnum> = {
  [key in keyof ElemEnum]: NSSElemFunc<CondEnum>;
} & {
  [key in keyof CondEnum]: NSSCondFunc;
} & NSSCond;

export type NSSElem<CondEnum> = {
  [key in keyof CondEnum]: NSSCondFunc;
} & NSSObject;

export type NSSCond = NSSObject & {
  __nssCondOff__?: boolean;
};

export type NSSBaseFunc<ElemEnum, CondEnum> = NSSBase<ElemEnum, CondEnum> &
  ((...args: NSSArg<CondEnum>[]) => NSSElem<CondEnum>);

export type NSSElemFunc<CondEnum> = NSSElem<CondEnum> &
  ((...args: NSSArg<CondEnum>[]) => NSSCond);

export type NSSCondFunc = NSSCond & ((on?: unknown) => NSSCond);

export type NSSArg<CondEnum> =
  | NSSElem<CondEnum>
  | NSSElemFunc<CondEnum>
  | NSSCond
  | NSSCondFunc
  | string[]
  | Record<string, unknown>;

export type NSSClassMap<NameEnum, ElemEnum, CondEnum> = Partial<
  Record<keyof NameEnum | keyof ElemEnum | keyof CondEnum, string>
>;

export type NSSConfig = {
  elementSeparator: string;
  conditionalSeparator: string;
};

const defaultConfig: NSSConfig = {
  elementSeparator: "-",
  conditionalSeparator: "--",
};

const config = { ...defaultConfig };

function toStringError(): string {
  throw new Error(
    "Do not coerce to string directly; use .c (.class) or .s (.string)"
  );
}

export default function nss<
  NameEnum = object,
  ElemEnum = object,
  CondEnum = object
>(
  nameEnum?: null | Record<keyof NameEnum, string | number | boolean>,
  elemEnum?: null | Record<keyof ElemEnum, string | number | boolean>,
  condEnum?: null | Record<keyof CondEnum, string | number | boolean>,
  classMap?:
    | null
    | NSSClassMap<NameEnum, ElemEnum, CondEnum>
    | ((
        classMap: NSSClassMap<NameEnum, ElemEnum, CondEnum>
      ) => void | NSSClassMap<NameEnum, ElemEnum, CondEnum>)
): NSS<NameEnum, ElemEnum, CondEnum> {
  const elemSep = () => config.elementSeparator;
  const condSep = () => config.conditionalSeparator;

  nameEnum = omitEnumReverseMappings(nameEnum);
  elemEnum = omitEnumReverseMappings(elemEnum);
  condEnum = omitEnumReverseMappings(condEnum);

  if (typeof classMap === "function") {
    const classMapRet = {};
    classMap = classMap(classMapRet) ?? classMapRet;
  }

  const [baseName, baseClass] = extractNameEnumData<
    NameEnum,
    ElemEnum,
    CondEnum
  >(nameEnum, classMap);

  function crossPollinate([name, cls]: [string, unknown]): [string, unknown] {
    const mappedCls = mappings.get(name);
    if (mappedCls) {
      if (!cls || cls === name) {
        return [name, mappedCls];
      } else {
        return [name, cls + " " + mappedCls];
      }
    } else if (typeof cls === "string" && cls.length) {
      mappings.set(name, cls);
    } else {
      mappings.set(name, null);
    }
    return [name, cls];
  }

  // Cross-pollinate class mappings between enums and auxilliary mapping object:
  const mapEntries = Object.entries(classMap ?? []);
  const mappings = new Map(mapEntries);
  if (baseName) {
    mappings.set(baseName, baseClass ?? null);
  }
  elemEnum = Object.fromEntries(
    Object.entries(elemEnum ?? {}).map(crossPollinate)
  ) as typeof elemEnum;
  condEnum = Object.fromEntries(
    Object.entries(condEnum ?? {}).map(crossPollinate)
  ) as typeof condEnum;

  function makeCondClassBuilders(
    classPrelude: string | null,
    classPrefix: string
  ) {
    function makeBuilders() {
      return Object.fromEntries(
        Object.entries(condEnum ?? {}).map(([condName, condClass]) => {
          const priorClass = classPrelude ? classPrelude + " " : "";
          const afterClass =
            condClass && condClass !== condName ? " " + condClass : "";

          function builder(on?: unknown) {
            // note: standard function rather than arrow-function needed here
            //       so that arguments.length can be correctly inspected;
            //       allows distinction between myCls() and myCls(undefined) calls
            let str: string;
            let cls: string;
            let __nssCondOff__;
            if (!arguments.length || on) {
              __nssCondOff__ = false;
              str = classPrefix + condName + afterClass;
              cls = priorClass + str;
            } else {
              __nssCondOff__ = true;
              str = "";
              cls = classPrelude ?? "";
            }
            return {
              __nss__: true,
              ...(__nssCondOff__ ? { __nssCondOff__: true } : {}),
              name: condName,
              class: cls,
              c: cls,
              string: str,
              s: str,
              toString: toStringError,
            };
          }

          builder.__nss__ = true;
          builder.string = builder.s = classPrefix + condName + afterClass;
          builder.class = builder.c = priorClass + builder.string;
          builder.toString = toStringError;

          // Set en.cond.name:
          Object.defineProperty(builder, "name", {
            value: condName,
            writable: false,
          });

          return [condName, builder];
        })
      );
    }
    return makeBuilders();
  }

  const elemClsBuilders = Object.fromEntries(
    Object.entries(elemEnum ?? {}).map(([elemName, elemClass]) => {
      let space;
      const afterClass =
        elemClass && elemClass !== elemName ? (elemClass as string) : "";
      const classPrefix = baseName ? baseName + elemSep() : "";

      function builder(...args: NSSArg<CondEnum>[]) {
        let str = afterClass;
        if (args.length) {
          const composed = composeClass<CondEnum>(
            builder,
            mappings,
            classPrefix + elemName + condSep(),
            args
          );
          space = str.length && composed.length ? " " : "";
          str += space + composed;
        }
        let cls = classPrefix + elemName;
        space = cls.length && str.length && str[0] !== " " ? " " : "";
        cls += space + str;
        return {
          __nss__: true,
          name: elemName,
          class: cls,
          c: cls,
          string: str,
          s: str,
          toString: toStringError,
        };
      }

      builder.__nss__ = true;
      builder.string = builder.s = afterClass;
      const prefix = classPrefix + elemName;
      space = prefix.length && builder.string.length ? " " : "";
      builder.class = builder.c = prefix + space + builder.string;
      builder.toString = toStringError;

      Object.assign(
        builder,
        makeCondClassBuilders(builder.c, classPrefix + elemName + condSep())
      );

      // Set en.elem.name:
      Object.defineProperty(builder, "name", {
        value: elemName,
        writable: false,
      });

      return [elemName, builder];
    })
  );

  const basePriorClass = baseName ?? "";
  const baseAfterClass = baseClass ?? "";
  const classPrefix = baseName ? baseName + condSep() : "";

  // Create top-level NSS object (en):
  function mainClsBuilder(...args: NSSArg<CondEnum>[]) {
    let str = baseAfterClass;
    if (args.length) {
      const composed = composeClass<CondEnum>(
        mainClsBuilder,
        mappings,
        classPrefix,
        args
      );
      const space = str.length && composed.length ? " " : "";
      str += space + composed;
    }
    const cls = basePriorClass + (baseName && str.length ? " " : "") + str;
    return {
      __nss__: true,
      name: baseName,
      class: cls,
      c: cls,
      string: str,
      s: str,
      toString: toStringError,
    };
  }

  mainClsBuilder.__nss__ = true;
  mainClsBuilder.class = mainClsBuilder.c =
    basePriorClass + (baseName && baseClass ? " " : "") + baseAfterClass;
  mainClsBuilder.string = mainClsBuilder.s = baseAfterClass;
  mainClsBuilder.toString = toStringError;

  // Set en.name:
  Object.defineProperty(mainClsBuilder, "name", {
    value: baseName,
    writable: false,
  });

  // Set en.<baseName>:
  // eg. en.Ship.s
  if (baseName) {
    Object.defineProperty(mainClsBuilder, baseName, {
      value: mainClsBuilder,
      writable: false,
    });
  }

  // Set en.elemA, en.elemB, etc:
  // eg. en.engine.s
  Object.assign(mainClsBuilder, elemClsBuilders);

  // Set en.condA, en.condB, etc:
  // eg. en.part.s
  Object.assign(
    mainClsBuilder,
    makeCondClassBuilders(
      mainClsBuilder.c,
      baseName ? baseName + condSep() : ""
    )
  );

  return mainClsBuilder as unknown as NSS<NameEnum, ElemEnum, CondEnum>;
}

// resolveNSSArg maps basic cond expressions (eg. en.myCond) to their corresponding
// namespaced cond expressions (eg. en.myElem.myCond) when composing conditionals:
// en.myElem(en.myCondA, en.myCondB)
// This obviates the need to supply fully-namespaced conditionals in this case, eg.
// en.myElem(en.myElem.myCondA, en.myElem.myCondB)
export function resolveNSSArg<CondEnum>(
  builder: NSSObject,
  arg: string | NSSArg<CondEnum>
): string | NSSArg<CondEnum> {
  const { __nss__, __nssCondOff__, name } = arg as NSSCond;
  if (__nss__) {
    const cond = (builder as unknown as Record<string, NSSCondFunc>)[name];
    if (cond) {
      return __nssCondOff__ ? cond(false).string : cond.string;
    } else {
      return (arg as NSSObject).string;
    }
  }
  return arg;
}

function composeClass<CondEnum>(
  builder: NSSObject,
  mappings: null | Map<string, string>,
  prefix: string,
  values: NSSArg<CondEnum>[]
): string {
  let res = "";
  for (const val of values) {
    // filter out null, undefined, false, 0, "":
    if (val) {
      if (typeof val === "string" || val instanceof String) {
        // this is a String:
        throw new Error(
          "Do not pass strings directly; enclose in object or array"
        );
      } else if ((val as NSSObject)?.__nss__) {
        const str = resolveNSSArg(builder, val) as string;
        res += str?.length ? " " + str : "";
      } else {
        // this is an Object or Array:
        let entries;
        if (Array.isArray(val)) {
          entries = val.map<[string, boolean]>((cls) => [cls, true]);
        } else {
          try {
            entries = Object.entries(val);
          } catch (e) {
            entries = null;
          }
          if (!entries?.length) {
            throw new Error(`NSS Error: Invalid input ${JSON.stringify(val)}.`);
          }
        }
        for (const [name, on] of entries) {
          if (on) {
            res += " " + prefix + name;
            const mappedCls = mappings?.get(name as string);
            if (
              mappedCls?.length &&
              (typeof mappedCls === "string" ||
                (mappedCls as unknown) instanceof String)
            ) {
              res += " " + mappedCls;
            }
          }
          // Ignore classes associated with all other `on` values, even those
          // that are "truthy". This allows easily passing props objects into
          // nss where boolean props are meant to be used as classes, but
          // all other props should be ignored.
          // If "truthiness" checks are desired, input must simply be cast to
          // bool first, eg. en({ myclass: !!myprop })
        }
      }
    }
  }
  return res.slice(1); // trim off leading space
}

function omitEnumReverseMappings<T>(enumObj: T): T {
  return !enumObj
    ? enumObj
    : (Object.fromEntries(
        Object.entries(enumObj)
          .filter(([key]) => !Number.isInteger(Number(key)))
          .map(([key, val]) => [
            key,
            Number.isInteger(Number(val)) ? null : val,
          ])
      ) as T);
}

function extractNameEnumData<NameEnum, ElemEnum, CondEnum>(
  nameEnum?: null | Record<string, string | number | boolean | null>,
  classMap?: null | NSSClassMap<NameEnum, ElemEnum, CondEnum>
): [string | null, string | null] {
  let baseName: string | null = null;
  let baseClass: string | null = null;

  if (nameEnum && typeof nameEnum === "object") {
    const entries = Object.entries(nameEnum);
    if (entries.length > 1) {
      throw new Error(
        "NSS Error: Invalid name enum provided; should have at most 1 field."
      );
    } else if (entries.length === 1) {
      [[baseName, baseClass]] = entries as [[string, string]];
      // handle numeric enum where keys map to arbitrary integers:
      if (typeof baseClass !== "string") {
        baseClass === null;
      }
      // handle string enum where keys map to equivalent value:
      if (baseName === baseClass) {
        baseClass === null;
      }
    }
  }

  if (baseName && classMap && typeof classMap === "object") {
    const mappedBaseCls =
      Object.prototype.hasOwnProperty.call(classMap, baseName) &&
      classMap[baseName as keyof NameEnum];
    if (mappedBaseCls) {
      baseClass = (baseClass ? baseClass + " " : "") + mappedBaseCls;
    }
  }

  return [baseName, baseClass];
}

nss.configure = function (configUpdate: null | Partial<NSSConfig>) {
  Object.assign(config, configUpdate === null ? defaultConfig : configUpdate);
};