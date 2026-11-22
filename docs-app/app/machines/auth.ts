import { tracked } from '@glimmer/tracking'
import { after, invoke, Machine, State, transition } from '@switchyard-ts/core'

export class Session extends State {
  static LoggedOut = Session.of('loggedOut')
  static LoggingIn = Session.of('loggingIn')
  static LoggedIn = Session.of('loggedIn')
  static Expired = Session.of('expired')

  // real-enums derives a label from the value; camelCase values read better spelled out.
  override get label(): string {
    const labels: Record<string, string> = {
      loggedOut: 'Signed out',
      loggingIn: 'Signing in',
      loggedIn: 'Signed in',
    }
    return labels[this.value] ?? super.label
  }
}

/** An app-wide session, held by a service. Its state and user survive reloads (see persist). */
export class Auth extends Machine<Session> {
  static override persist = ['user']

  @tracked user?: string

  @transition({ from: [Session.LoggedOut, Session.Expired], to: Session.LoggingIn })
  logIn(user: string) {
    this.user = user
  }

  @invoke(Session.LoggingIn, { onDone: Session.LoggedIn, onError: Session.LoggedOut })
  async authenticate(signal: AbortSignal) {
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 600)
      signal.addEventListener('abort', () => (clearTimeout(t), reject(new Error('aborted'))))
    })
  }

  @after(8000, { from: Session.LoggedIn, to: Session.Expired })
  expire() {}

  @transition({ from: [Session.LoggedIn, Session.Expired], to: Session.LoggedOut })
  logOut() {
    this.user = undefined
  }
}
