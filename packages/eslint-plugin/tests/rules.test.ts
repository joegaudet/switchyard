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

tester.run('state-brand', plugin.rules['state-brand'], {
  valid: [
    `class Pane extends State {
      private declare readonly brand: never
      static Shown = Pane.of('shown')
    }`,
    // Not a state enum.
    `class Color extends Enum { static Red = Color.of('red') }`,
  ],
  invalid: [
    {
      code: `class Pane extends State {
  static Shown = Pane.of('shown')
}`,
      output: `class Pane extends State {
  private declare readonly brand: never
  static Shown = Pane.of('shown')
}`,
      errors: [
        {
          message:
            'Pane needs `private declare readonly brand: never`, so TypeScript tells its states from other enums.',
        },
      ],
    },
  ],
})

const tools = `
class Tool extends State {
  private declare readonly brand: never
  static Select = Tool.of('select')
  static Hand = Tool.of('hand')
  static Pan = Tool.of('pan')
  @is() declare isSelect: boolean
  @isNot() declare isNotHand: boolean
}`

const predicateError = (expr: string, use: string) => ({
  message: `Compare states with their @is()/@isNot() predicate (${use}), not \`${expr}\`.`,
})

tester.run('prefer-state-predicate', plugin.rules['prefer-state-predicate'], {
  valid: [
    `${tools}\nconst a = tool.isSelect`,
    // Not a State enum of this file.
    `const a = color === Color.Red`,
  ],
  invalid: [
    {
      code: `${tools}\nconst a = this.tool === Tool.Select`,
      output: `${tools}\nconst a = this.tool.isSelect`,
      errors: [predicateError('this.tool === Tool.Select', '`this.tool.isSelect`')],
    },
    {
      code: `${tools}\nconst a = Tool.Select !== tool`,
      output: `${tools}\nconst a = !tool.isSelect`,
      errors: [predicateError('Tool.Select !== tool', '`!tool.isSelect`')],
    },
    {
      code: `${tools}\nconst a = tool !== Tool.Hand`,
      output: `${tools}\nconst a = tool.isNotHand`,
      errors: [predicateError('tool !== Tool.Hand', '`tool.isNotHand`')],
    },
    {
      // Only isNotHand: the fix negates it.
      code: `${tools}\nconst a = tool === Tool.Hand`,
      output: `${tools}\nconst a = !tool.isNotHand`,
      errors: [predicateError('tool === Tool.Hand', '`!tool.isNotHand`')],
    },
    {
      // No predicate for Pan: reported, not fixed.
      code: `${tools}\nconst a = tool === Tool.Pan`,
      output: null,
      errors: [predicateError('tool === Tool.Pan', 'add an `@is()` predicate `isPan`')],
    },
    {
      // A call on the other side is not rewritten.
      code: `${tools}\nconst a = pick() === Tool.Select`,
      output: null,
      errors: [predicateError('pick() === Tool.Select', '`.isSelect`')],
    },
  ],
})
