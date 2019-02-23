export function transformObject(input: Object, transformer: (value: any, key: string) => any): Object;
export function transformObjectRecursive(input: Object, transformer: (value: any, key: string) => any): Object;
export function isPlainObject(input: any): boolean;
export function flatten(obj: object|undefined, options?: object): Object|undefined;
export function getNodeJsVersions(): { major: number, minor: number, revision: number };
