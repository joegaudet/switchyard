import { tracked } from '@glimmer/tracking'
import { is } from '@real-enums/core'
import { after, history, invoke, Machine, State, transition } from '@switchyard-ts/core'

export class Attempt extends State {
  static First = Attempt.of('first')
  static Retrying = Attempt.of('retrying')
}

export class FetchState extends State {
  static Idle = FetchState.of('idle')
  static Loading = FetchState.of('loading', { children: Attempt, history: 'shallow' })
  static Done = FetchState.of('done')
  static Failed = FetchState.of('failed')

  @is() declare isIdle: boolean
  @is() declare isLoading: boolean
  @is() declare isFailed: boolean
}

/** A pretend API: answers after `delay` ms, and fails while `failing` is on. */
export const api = {
  delay: 900,
  failing: true,
  get(signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => (api.failing ? reject(new Error('503')) : resolve('Ada Lovelace')),
        api.delay,
      )
      signal.addEventListener('abort', () => clearTimeout(timer))
    })
  },
}

export class Fetch extends Machine<FetchState> {
  @tracked user?: string
  @tracked retries = 0

  get hasRetriesLeft() {
    return this.retries < 3
  }

  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch() {}

  @transition({ from: FetchState.Failed, to: history(FetchState.Loading), guard: 'hasRetriesLeft' })
  retry() {
    this.retries++
  }

  @transition({ from: [FetchState.Done, FetchState.Failed], to: FetchState.Idle })
  reset() {
    this.retries = 0
    this.user = undefined
  }

  @invoke(FetchState.Loading, { onDone: FetchState.Done, onError: FetchState.Failed })
  async load(signal: AbortSignal) {
    this.user = await api.get(signal)
  }

  // A slow answer counts as a failure, and the next try is a retry.
  @after(3000, { from: Attempt.First, to: Attempt.Retrying })
  slow() {}
}
