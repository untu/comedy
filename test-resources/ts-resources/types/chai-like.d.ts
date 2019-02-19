// Type definitions for chai-like 0.1.10
// Project: https://github.com/zation/chai-like
// Definitions by: noctifer20 <https://github.com/noctifer20>,

/// <reference types="chai" />

declare module 'chai-like' {
  function chaiLike(chai: any, utils: any): void;
  namespace chaiLike {

  }
  export = chaiLike;
}

declare namespace Chai {
  interface Assertion extends LanguageChains, NumericComparison, TypeComparison {
    like(toMatch: object|object[]): Assertion;
  }
}
