import {exclamation} from './test-typescript-actor-dependency';

export default class TestActor {
  hello(text: string): string {
    return `Hello ${text}${exclamation}`;
  }
}