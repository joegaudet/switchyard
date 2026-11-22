// Type tests: each @ts-expect-error asserts a compile error, and `pnpm typecheck:tools` fails if
// one stops erroring. The runtime assertions only keep vitest from reporting an empty file.
import { expect, it } from 'vitest'
import { Machine, region, State, transition } from '../src/index.js'

class Attempt extends State {
  declare private readonly brand: never
  static First = Attempt.of('first')
  static Retrying = Attempt.of('retrying')
}

class FetchState extends State<Attempt> {
  declare private readonly brand: never
  static Idle = FetchState.of('idle')
  static Loading = FetchState.of('loading', { children: Attempt })
}

class Toggle extends State {
  declare private readonly brand: never
  static Off = Toggle.of('off')
  static On = Toggle.of('on')
}

class Level extends State {
  declare private readonly brand: never
  static Low = Level.of('low')
}

class Inverse extends State {
  declare private readonly brand: never
  static Off = Inverse.of('off')
  static On = Inverse.of('on')
}

class Fetch extends Machine<FetchState> {
  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch() {}
}

class Editor extends Machine<{ bold: Toggle }> {
  @region(Toggle) accessor bold!: Toggle
}

it('can() and matches() take the states of the machine, at any depth', () => {
  const m = new Fetch()
  expect(m.can(FetchState.Loading)).toBe(true)
  expect(m.can(Attempt.Retrying)).toBe(false)
  expect(m.matches(Attempt.First)).toBe(false)
  expect(new Editor().can(Toggle.On)).toBe(false)
})

it('and reject the states of another machine', () => {
  const m = new Fetch()
  // @ts-expect-error Level is not a state of Fetch
  expect(() => m.can(Level.Low)).toThrow()
  // @ts-expect-error Level is not a state of Fetch
  expect(() => m.matches(Level.Low)).not.toThrow()
  // @ts-expect-error Level is not a state of Editor, though both enums are bare
  expect(() => new Editor().can(Level.Low)).toThrow()
  // @ts-expect-error Inverse.On is not Toggle.On, though both have the value 'on'
  expect(() => new Editor().can(Inverse.On)).toThrow()
})

it('a state enum names the enums of its children', () => {
  class Bare extends State {
    declare private readonly brand: never
    // @ts-expect-error children: Attempt needs `extends State<Attempt>`
    static Loading = Bare.of('loading', { children: Attempt })
  }
  class Wrong extends State<Toggle> {
    declare private readonly brand: never
    // @ts-expect-error Attempt is not the declared Toggle
    static Loading = Wrong.of('loading', { children: Attempt })
    static Editing = Wrong.of('editing', { regions: { bold: Toggle } })
  }
  expect([Bare.Loading, Wrong.Editing]).toHaveLength(2)
})
