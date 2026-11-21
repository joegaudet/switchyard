// The DSL fixtures, compiled with TC39 standard decorators. machines.legacy.ts is the same
// source compiled the way Ember apps compile it; spec.ts runs one suite against both.
import { is } from '@real-enums/core'
import {
  always,
  and,
  history,
  Machine,
  not,
  onEntry,
  onExit,
  region,
  State,
  transition,
} from '../../src/index.js'

export class Attempt extends State {
  static First = Attempt.of('first')
  static Retrying = Attempt.of('retrying')
}

export class FetchState extends State {
  static Idle = FetchState.of('idle')
  static Loading = FetchState.of('loading', { children: Attempt, history: 'shallow' })
  static Done = FetchState.of('done')
  static Failed = FetchState.of('failed')

  @is() accessor isLoading!: boolean
}

export class Fetch extends Machine<FetchState> {
  log: string[] = []
  data?: string
  retries = 0
  online = true

  get hasRetriesLeft() {
    return this.retries < 2
  }

  get isOnline() {
    return this.online
  }

  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch() {
    this.log.push('fetch')
  }

  @transition({ from: FetchState.Loading, to: FetchState.Done })
  resolve(data: string) {
    this.data = data
  }

  @transition({ from: FetchState.Loading, to: FetchState.Failed })
  reject() {}

  @transition({ from: Attempt.First, to: Attempt.Retrying })
  stall() {}

  @transition({
    from: FetchState.Failed,
    to: history(FetchState.Loading),
    guard: and('hasRetriesLeft', 'isOnline'),
  })
  @transition({ from: FetchState.Done, to: FetchState.Idle })
  retry() {
    this.retries++
  }

  @transition({ from: FetchState.Failed, to: FetchState.Idle, guard: not('hasRetriesLeft') })
  giveUp() {}

  @transition({ to: FetchState.Idle })
  reset() {}

  @transition({ from: FetchState.Idle })
  async ping() {}

  @onEntry(FetchState.Loading)
  enterLoading() {
    this.log.push('enter loading')
  }

  @onExit(FetchState.Loading)
  exitLoading() {
    this.log.push('exit loading')
  }
}

export class StrictFetch extends Fetch {
  static override strict = true
}

export class Toggle extends State {
  static Off = Toggle.of('off')
  static On = Toggle.of('on')
}

export class Editor extends Machine<{ bold: Toggle; italic: Toggle }> {
  @region(Toggle) accessor bold!: Toggle
  @region(Toggle) accessor italic!: Toggle

  @transition({ in: 'bold', from: Toggle.Off, to: Toggle.On })
  @transition({ in: 'bold', from: Toggle.On, to: Toggle.Off })
  toggleBold() {}

  @transition({ in: 'italic', from: Toggle.Off, to: Toggle.On })
  italicize() {}
}

export class Level extends State {
  static Low = Level.of('low')
  static High = Level.of('high')
}

export class Counter extends Machine<Level> {
  count = 0
  log: string[] = []

  get isHigh() {
    return this.count >= 2
  }

  @transition({ from: Level.Low })
  inc() {
    this.count++
  }

  @always({ from: Level.Low, to: Level.High, guard: 'isHigh' })
  promote() {
    this.log.push('promoted')
  }
}

export class Step extends State {
  static A = Step.of('a')
  static B = Step.of('b')
  static C = Step.of('c')
}

export class Chain extends Machine<Step> {
  log: string[] = []

  @transition({ from: Step.A, to: Step.B })
  go() {
    this.next()
    this.log.push('go')
  }

  @transition({ from: Step.B, to: Step.C })
  next() {
    this.log.push('next')
  }
}

export function badGuard(): Machine<unknown> {
  class Bad extends Machine<Step> {
    @transition({ from: Step.A, to: Step.B, guard: 'nope' })
    go() {}
  }
  return new Bad()
}

export function ambiguousRegion(): Machine<unknown> {
  class Bad extends Machine<{ bold: Toggle; italic: Toggle }> {
    @region(Toggle) accessor bold!: Toggle
    @region(Toggle) accessor italic!: Toggle

    @transition({ from: Toggle.Off, to: Toggle.On })
    flip() {}
  }
  return new Bad()
}
