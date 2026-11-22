// The DSL fixtures compiled with legacy decorators (experimentalDecorators), the way Ember
// apps compile them through decorator-transforms. Same source as machines.standard.ts,
// except fields: legacy decorators cannot decorate `accessor`, so they decorate plain fields.
import { is } from '@real-enums/core'
import {
  after,
  always,
  and,
  history,
  invoke,
  Machine,
  manualClock,
  not,
  onEntry,
  onExit,
  region,
  State,
  transition,
} from '../../src/index.js'

export class Attempt extends State {
  declare private readonly brand: never
  static First = Attempt.of('first')
  static Retrying = Attempt.of('retrying')
}

export class FetchState extends State<Attempt> {
  declare private readonly brand: never
  static Idle = FetchState.of('idle')
  static Loading = FetchState.of('loading', { children: Attempt, history: 'shallow' })
  static Done = FetchState.of('done')
  static Failed = FetchState.of('failed')

  @is() declare isLoading: boolean
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
    guard: and((m: Fetch) => m.hasRetriesLeft, 'isOnline'),
  })
  @transition({ from: FetchState.Done, to: FetchState.Idle })
  retry() {
    this.retries++
  }

  @transition({
    from: FetchState.Failed,
    to: FetchState.Idle,
    guard: not((m: Fetch) => m.hasRetriesLeft),
  })
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
  declare private readonly brand: never
  static Off = Toggle.of('off')
  static On = Toggle.of('on')
}

export class Editor extends Machine<{ bold: Toggle; italic: Toggle }> {
  @region(Toggle) declare bold: Toggle
  @region(Toggle) declare italic: Toggle

  @transition({ in: 'bold', from: Toggle.Off, to: Toggle.On })
  @transition({ in: 'bold', from: Toggle.On, to: Toggle.Off })
  toggleBold() {}

  @transition({ in: 'italic', from: Toggle.Off, to: Toggle.On })
  italicize() {}
}

export class Level extends State {
  declare private readonly brand: never
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

  @always({ from: Level.Low, to: Level.High, guard: (m: Counter) => m.isHigh })
  promote() {
    this.log.push('promoted')
  }
}

export class Step extends State {
  declare private readonly brand: never
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
    @region(Toggle) declare bold: Toggle
    @region(Toggle) declare italic: Toggle

    @transition({ from: Toggle.Off, to: Toggle.On })
    flip() {}
  }
  return new Bad()
}

export class Job extends State {
  declare private readonly brand: never
  static Idle = Job.of('idle')
  static Running = Job.of('running')
  static Done = Job.of('done')
  static Failed = Job.of('failed')
  static TimedOut = Job.of('timedOut')
}

export class Worker extends Machine<Job> {
  static override clock = manualClock()
  result?: string
  signal?: AbortSignal
  settle?: { resolve(v: string): void; reject(e: Error): void }

  @transition({ from: Job.Idle, to: Job.Running })
  begin() {}

  @transition({ from: Job.Running, to: Job.Idle })
  cancel() {}

  @invoke(Job.Running, { onDone: Job.Done, onError: Job.Failed })
  async run(signal: AbortSignal) {
    this.signal = signal
    this.result = await new Promise<string>(
      (resolve, reject) => (this.settle = { resolve, reject }),
    )
  }

  @after(1000, { from: Job.Running, to: Job.TimedOut })
  timeout() {}
}

export class Upload extends State {
  declare private readonly brand: never
  static Sending = Upload.of('sending')
  static Sent = Upload.of('sent', { final: true })
}

export class FileUpload extends Machine<Upload> {
  constructor(readonly name: string) {
    super()
  }

  get output() {
    return `${this.name} uploaded`
  }

  @transition({ from: Upload.Sending, to: Upload.Sent })
  finish() {
    this.sendParent('progressed', this.name)
  }
}

export class Queue extends State {
  declare private readonly brand: never
  static Working = Queue.of('working')
  static Empty = Queue.of('empty')
}

export class Uploader extends Machine<Queue> {
  log: string[] = []

  add(name: string) {
    return this.spawn(new FileUpload(name), { id: name, systemId: name })
  }

  @transition({ from: Queue.Working })
  progressed(name: string) {
    this.log.push(name)
    this.emit(this.progressed, { name })
  }

  @invoke(Queue.Working, { id: 'main', onDone: Queue.Empty })
  main() {
    return new FileUpload('main')
  }
}
