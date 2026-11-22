import { Machine, State, transition } from '@switchyard/core'

export class FetchState extends State {
  static Idle = FetchState.of('idle')
  static Loading = FetchState.of('loading')
  static Done = FetchState.of('done')
}

export class Fetch extends Machine<FetchState> {
  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch(url: string, options?: { retries: number }) {
    void url
    void options
  }

  @transition({ from: FetchState.Loading, to: FetchState.Done })
  resolve() {}
}

export const notAMachine = 42
