import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { always, createInterpreter, history, Machine, State, transition } from '@switchyard/core'
import { createActor, createMachine, type AnyActorRef } from 'xstate'
import { describe, expect, it } from 'vitest'
import { fromXState, toClassSource, toXState, type XStateNode } from '../src/index.js'

// --- equivalence harness: one event sequence through xstate and through Switchyard ---------

type Value = string | { [k: string]: Value }
const leaves = (value: Value, prefix = ''): string[] =>
  typeof value === 'string'
    ? [prefix ? `${prefix}.${value}` : value]
    : Object.entries(value).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k))

function xstateRun(json: XStateNode, guards: Record<string, () => boolean>, events: string[]) {
  const actor: AnyActorRef = createActor(
    createMachine(json as never).provide({ guards } as never),
  ).start()
  const seen = [leaves(actor.getSnapshot().value as Value).sort()]
  for (const type of events) {
    actor.send({ type })
    seen.push(leaves(actor.getSnapshot().value as Value).sort())
  }
  return seen
}

function ours(send: (type: string) => void, configuration: () => string[], events: string[]) {
  const seen = [[...configuration()].sort()]
  for (const type of events) {
    send(type)
    seen.push([...configuration()].sort())
  }
  return seen
}

// --- a decorated machine with hierarchy, deep history, a guard, eventless and final states ---

class Section extends State {
  static Name = Section.of('name')
  static Email = Section.of('email')
}

class Step extends State {
  static Start = Step.of('start')
  static Form = Step.of('form', { children: Section, history: 'deep' })
  static Review = Step.of('review')
  static Check = Step.of('check')
  static Done = Step.of('done', { final: true })
}

class Wizard extends Machine<Step> {
  valid = true

  get isValid() {
    return this.valid
  }

  @transition({ from: Step.Start, to: Step.Form })
  begin() {}

  @transition({ from: Section.Name, to: Section.Email })
  next() {}

  @transition({ from: Step.Form, to: Step.Check })
  review() {}

  @always({ from: Step.Check, to: Step.Review, guard: 'isValid' })
  checked() {}

  @transition({ from: Step.Review, to: history(Step.Form) })
  back() {}

  @transition({ from: Step.Review, to: Step.Done })
  submit() {}
}

const sequence = ['begin', 'next', 'review', 'back', 'review', 'submit', 'begin']

describe('toXState', () => {
  it('exports JSON that xstate runs exactly as Switchyard does', () => {
    const json = toXState(Wizard)
    expect(JSON.parse(JSON.stringify(json))).toEqual(json)
    const m = new Wizard()
    expect(
      ours(
        t => m.send(t),
        () => m.snapshot().configuration,
        sequence,
      ),
    ).toEqual(xstateRun(json, { isValid: () => true }, sequence))
  })

  it('writes absolute targets, guard and action names, and history nodes', () => {
    const json = toXState(Wizard)
    expect(json.id).toBe('Wizard')
    expect(json.initial).toBe('start')
    expect(json.states!['review']!.on!['back']).toEqual([
      { target: '#Wizard.form.$history', actions: ['back'] },
    ])
    expect(json.states!['check']!.always).toEqual([
      { target: '#Wizard.review', guard: 'isValid', actions: ['checked'] },
    ])
    expect(json.states!['form']!.states!['$history']).toEqual({ type: 'history', history: 'deep' })
  })
})

// --- an xstate config, written the way xstate users write them --------------------------------

const player: XStateNode = {
  id: 'player',
  initial: 'stopped',
  states: {
    stopped: { on: { play: 'playing' } },
    playing: {
      initial: 'normal',
      on: { stop: 'stopped', seek: { target: '.seeking', guard: 'canSeek' } },
      states: {
        normal: { on: { fast: 'fast' } },
        fast: { on: { slow: '#player.playing.normal' } },
        seeking: { always: [{ target: 'normal' }] },
        hist: { type: 'history', history: 'shallow' },
      },
    },
    paused: { on: { resume: 'playing.hist' } },
  },
  on: { pause: '.paused' },
}
const playerSequence = ['play', 'fast', 'pause', 'resume', 'slow', 'seek', 'stop', 'resume', 'play']

describe('fromXState', () => {
  it('imports an xstate config that runs exactly as xstate does', () => {
    const i = createInterpreter(fromXState(player, { guards: { canSeek: () => true } })).start()
    expect(
      ours(
        t => i.send({ type: t }),
        () => i.snapshot().configuration,
        playerSequence,
      ),
    ).toEqual(xstateRun(player, { canSeek: () => true }, playerSequence))
  })

  it('refuses a guard or actor without an implementation, and an unknown target', () => {
    expect(() => fromXState(player)).toThrow(/guard "canSeek" has no implementation/)
    expect(() => fromXState({ initial: 'a', states: { a: { invoke: { src: 'load' } } } })).toThrow(
      /actor "load" has no implementation/,
    )
    expect(() => fromXState({ initial: 'a', states: { a: { on: { go: 'nowhere' } } } })).toThrow(
      /target "nowhere" from "a" names no state/,
    )
  })
})

describe('toClassSource', () => {
  const source = toClassSource(player, 'Player')

  it('writes a decorated class', () => {
    expect(source).toMatchInlineSnapshot(`
      "// Generated by @switchyard/interop from an xstate config.
      import { Machine, State, always, history, transition } from '@switchyard/core'

      export class PlayerPlaying extends State {
        static Normal = PlayerPlaying.of('normal')
        static Fast = PlayerPlaying.of('fast')
        static Seeking = PlayerPlaying.of('seeking')
      }

      export class PlayerState extends State {
        static Stopped = PlayerState.of('stopped')
        static Playing = PlayerState.of('playing', { children: PlayerPlaying, history: 'shallow' })
        static Paused = PlayerState.of('paused')
      }

      export class Player extends Machine<PlayerState> {
        get canSeek(): boolean {
          return false // TODO: the "canSeek" guard
        }

        @transition({ to: PlayerState.Paused })
        pause() {}

        @transition({ from: PlayerState.Stopped, to: PlayerState.Playing })
        play() {}

        @transition({ event: 'stop', from: PlayerState.Playing, to: PlayerState.Stopped })
        onStop() {}

        @transition({ from: PlayerState.Playing, to: PlayerPlaying.Seeking, guard: 'canSeek' })
        seek() {}

        @transition({ from: PlayerPlaying.Normal, to: PlayerPlaying.Fast })
        fast() {}

        @transition({ from: PlayerPlaying.Fast, to: PlayerPlaying.Normal })
        slow() {}

        @transition({ from: PlayerState.Paused, to: history(PlayerState.Playing) })
        resume() {}

        @always({ from: PlayerPlaying.Seeking, to: PlayerPlaying.Normal })
        alwaysPlayingSeeking() {}
      }
      "
    `)
  })

  it('generates a class that runs exactly as xstate does', async () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '.generated')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'player.ts')
    writeFileSync(file, source)
    const { Player } = (await import(/* @vite-ignore */ file)) as {
      Player: new () => Machine<unknown>
    }
    // The generated guard is a TODO stub returning false; give it the behaviour under test.
    Object.defineProperty(Player.prototype, 'canSeek', { get: () => true })
    const m = new Player()
    expect(
      ours(
        t => m.send(t),
        () => m.snapshot().configuration,
        playerSequence,
      ),
    ).toEqual(xstateRun(player, { canSeek: () => true }, playerSequence))
  })
})
