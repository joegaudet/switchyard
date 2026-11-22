import {
  after,
  history,
  invoke,
  Machine,
  onEntry,
  region,
  State,
  transition,
  and,
} from '@switchyard/core'

export class Attempt extends State {
  static First = Attempt.of('first')
  static Retrying = Attempt.of('retrying')
}

export class FetchState extends State {
  static Idle = FetchState.of('idle')
  static Loading = FetchState.of('loading', { children: Attempt, history: 'shallow' })
  static Failed = FetchState.of('failed')
  static Done = FetchState.of('done', { final: true })
}

export class Fetch extends Machine<FetchState> {
  retries = 0
  online = true

  get hasRetriesLeft() {
    return this.retries < 3
  }

  get isOnline() {
    return this.online
  }

  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch(_url: string) {}

  @transition({ from: Attempt.First, to: Attempt.Retrying })
  stall() {}

  @transition({
    from: FetchState.Failed,
    to: history(FetchState.Loading),
    guard: and('hasRetriesLeft', 'isOnline'),
  })
  retry() {
    this.retries++
  }

  @onEntry(FetchState.Loading)
  showSpinner() {}

  @invoke(FetchState.Loading, { onDone: FetchState.Done, onError: FetchState.Failed })
  async load() {}

  @after(5000, { from: FetchState.Loading, to: FetchState.Failed })
  timeout() {}
}

export class Toggle extends State {
  static Off = Toggle.of('off')
  static On = Toggle.of('on')
}

export class Editor extends Machine<{ bold: Toggle; italic: Toggle }> {
  @region(Toggle) accessor bold!: Toggle
  @region(Toggle) accessor italic!: Toggle

  @transition({ in: 'bold', from: Toggle.Off, to: Toggle.On })
  embolden() {}
}

export class Step extends State {
  static Sending = Step.of('sending')
  static Sent = Step.of('sent', { final: true })
}

export class FileUpload extends Machine<Step> {
  @transition({ from: Step.Sending, to: Step.Sent })
  finish() {}
}

export class QueueState extends State {
  static Working = QueueState.of('working')
}

export class Uploader extends Machine<QueueState> {
  @invoke(QueueState.Working, { id: 'main' })
  main() {
    return new FileUpload()
  }

  add(name: string) {
    return this.spawn(new FileUpload(), { id: name })
  }
}
