// Closing the gaps the xstate v5 feature matrix (PARITY.md) found.
import { describe, expect, it } from 'vitest'
import {
  after,
  Machine,
  manualClock,
  State,
  toPromise,
  transition,
  waitFor,
} from '../../src/index.js'

class Toggle extends State {
  declare private readonly brand: never
  static Off = Toggle.of('off')
  static On = Toggle.of('on')
}

class Doc extends State<Toggle> {
  declare private readonly brand: never
  static Viewing = Doc.of('viewing')
  static Editing = Doc.of('editing', { regions: { bold: Toggle, italic: Toggle } })
  static Saved = Doc.of('saved', { final: true })
}

class Editor extends Machine<Doc> {
  get output() {
    return 'saved!'
  }

  @transition({ from: Doc.Viewing, to: Doc.Editing })
  edit() {}

  @transition({ in: 'editing.bold', from: Toggle.Off, to: Toggle.On })
  embolden() {}

  @transition({ from: Doc.Editing, to: Doc.Saved })
  save() {}
}

describe('nested parallel states', () => {
  it('a state with regions runs each region at once, inside the hierarchy', () => {
    const m = new Editor()
    m.edit()
    expect(m.state).toBe(Doc.Editing)
    expect(m.snapshot().configuration).toEqual(['editing.bold.off', 'editing.italic.off'])
    m.embolden()
    expect(m.snapshot().configuration).toEqual(['editing.bold.on', 'editing.italic.off'])
    expect(Editor.toConfig().states!['editing']!.type).toBe('parallel')
  })

  it('a state cannot have both children and regions', () => {
    expect(() => Doc.of('both', { children: Toggle, regions: { a: Toggle } })).toThrow(
      /children or regions, not both/,
    )
  })
})

describe('waitFor and toPromise', () => {
  it('waitFor resolves once the predicate holds', async () => {
    const m = new Editor()
    const editing = waitFor(m, x => x.matches(Doc.Editing))
    m.edit()
    await expect(editing).resolves.toBe(m)
  })

  it('waitFor rejects after its timeout, on the machine clock', async () => {
    const clock = manualClock()
    const m = new Editor()
    const waiting = waitFor(m, x => x.matches(Doc.Saved), { timeout: 1000, clock })
    clock.advance(1000)
    await expect(waiting).rejects.toThrow(/Editor: waitFor timed out after 1000ms/)
  })

  it('toPromise resolves with the output when the machine finishes', async () => {
    const m = new Editor()
    const done = toPromise(m)
    m.edit()
    m.save()
    await expect(done).resolves.toBe('saved!')
  })
})

describe('dynamic delays', () => {
  it('@after takes a getter name, read when the state is entered', () => {
    class Light extends State {
      declare private readonly brand: never
      static Green = Light.of('green')
      static Red = Light.of('red')
    }
    const clock = manualClock()
    class Timed extends Machine<Light> {
      static override clock = clock
      wait = 500

      get greenFor() {
        return this.wait
      }

      @after('greenFor', { from: Light.Green, to: Light.Red })
      stopNow() {}
    }
    const m = new Timed()
    m.wait = 2000
    m.start()
    clock.advance(1999)
    expect(m.state).toBe(Light.Green)
    clock.advance(1)
    expect(m.state).toBe(Light.Red)
  })

  it('a machine with a named delay restores and validates its snapshots', () => {
    class Light extends State {
      declare private readonly brand: never
      static Green = Light.of('green')
      static Red = Light.of('red')
    }
    class Timed extends Machine<Light> {
      static override clock = manualClock()
      get greenFor() {
        return 100
      }

      @after('greenFor', { from: Light.Green, to: Light.Red })
      stopNow() {}
    }
    const m = new Timed().start()
    const snap = m.snapshot()
    expect(() => m.restore(snap)).not.toThrow()
    expect(Timed.schema()['~standard'].validate(snap)).toEqual({ value: snap })
  })
})
