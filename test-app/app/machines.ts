// Machines compiled by the app's own Babel (decorator-transforms, legacy semantics), the way a
// real Ember app compiles them.
import { tracked } from '@glimmer/tracking'
import { is } from '@real-enums/core'
import { after, invoke, Machine, State, transition } from '@switchyard/core'

export class FetchState extends State {
  static Idle = FetchState.of('idle')
  static Loading = FetchState.of('loading')
  static Done = FetchState.of('done')
  static TimedOut = FetchState.of('timedOut', {})

  @is() declare isIdle: boolean
}

export class Fetch extends Machine<FetchState> {
  @tracked data?: string

  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch() {}

  @invoke(FetchState.Loading, { onDone: FetchState.Done })
  async load() {
    await new Promise(resolve => setTimeout(resolve, 10))
    this.data = 'loaded'
  }
}

export class Timer extends Machine<FetchState> {
  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch() {}

  @after(20, { from: FetchState.Loading, to: FetchState.TimedOut })
  timeout() {}
}

export class SessionState extends State {
  static LoggedOut = SessionState.of('loggedOut')
  static LoggedIn = SessionState.of('loggedIn')
}

export class Session extends Machine<SessionState> {
  @tracked user?: string

  @transition({ from: SessionState.LoggedOut, to: SessionState.LoggedIn })
  login(user: string) {
    this.user = user
  }

  @transition({ from: SessionState.LoggedIn, to: SessionState.LoggedOut })
  logout() {
    this.user = undefined
  }
}

export class OrderState extends State {
  static Pending = OrderState.of('pending')
  static Shipped = OrderState.of('shipped')
  static Delivered = OrderState.of('delivered')
}

export class OrderFlow extends Machine<OrderState> {
  @transition({ from: OrderState.Pending, to: OrderState.Shipped })
  ship() {}

  @transition({ from: OrderState.Shipped, to: OrderState.Delivered })
  deliver() {}
}
