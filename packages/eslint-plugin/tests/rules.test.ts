import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, it } from 'vitest'
import plugin from '../src/index.js'

RuleTester.describe = describe
RuleTester.it = it
const tester = new RuleTester({ languageOptions: { parser: tseslint.parser as never } })

const states = `
class FetchState extends State {
  static Idle = FetchState.of('idle')
  static Loading = FetchState.of('loading')
  static Done = FetchState.of('done')
  static Lost = FetchState.of('lost')
}`

tester.run('no-unreachable-state', plugin.rules['no-unreachable-state'], {
  valid: [
    `${states}
    class Fetch extends Machine {
      @transition({ from: FetchState.Idle, to: FetchState.Loading }) fetch() {}
      @transition({ from: FetchState.Loading, to: FetchState.Done }) resolve() {}
      @invoke(FetchState.Loading, { onError: FetchState.Lost }) async load() {}
    }`,
    // An enum no machine in the file uses may be used elsewhere: no report.
    states,
  ],
  invalid: [
    {
      code: `${states}
      class Fetch extends Machine {
        @transition({ from: FetchState.Idle, to: FetchState.Loading }) fetch() {}
        @transition({ from: FetchState.Loading, to: history(FetchState.Done) }) resolve() {}
      }`,
      errors: [
        {
          message:
            'FetchState.Lost is never entered: it is not the first state, and nothing targets it.',
        },
      ],
    },
  ],
})

tester.run('no-unknown-guard', plugin.rules['no-unknown-guard'], {
  valid: [
    `class Fetch extends Machine {
      retries = 0
      get hasRetriesLeft() { return this.retries < 3 }
      @transition({ to: FetchState.Idle, guard: and('hasRetriesLeft', not('retries')) }) reset() {}
    }`,
    // A subclass of another machine may inherit the getter: not checked.
    `class Strict extends Fetch { @transition({ guard: 'inherited' }) go() {} }`,
  ],
  invalid: [
    {
      code: `class Fetch extends Machine {
        get hasRetriesLeft() { return true }
        @transition({ guard: or('hasRetriesLeft', 'isOnlin') }) retry() {}
        @always({ to: FetchState.Done, guard: 'ready' }) settle() {}
      }`,
      errors: [
        { message: 'Guard "isOnlin" is not a getter, field or method of Fetch.' },
        { message: 'Guard "ready" is not a getter, field or method of Fetch.' },
      ],
    },
  ],
})

tester.run('exhaustive-state-switch', plugin.rules['exhaustive-state-switch'], {
  valid: [
    `${states}
    switch (m.state) {
      case FetchState.Idle: case FetchState.Loading: case FetchState.Done: case FetchState.Lost: break
    }`,
    `${states}
    switch (m.state) { case FetchState.Idle: break; default: break }`,
    // Not a state switch.
    `switch (x) { case 1: break }`,
  ],
  invalid: [
    {
      code: `${states}
      switch (fetch.state) { case FetchState.Idle: break; case FetchState.Done: break }`,
      errors: [
        {
          message:
            'switch on fetch.state misses FetchState.Loading, FetchState.Lost; add them or a default.',
        },
      ],
    },
  ],
})
