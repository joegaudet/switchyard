import Service from '@ember/service'
import { machine } from '@switchyard-ts/ember'
import { Auth } from 'docs-app/machines/auth'

const KEY = 'switchyard-guide:auth'

/** One session for the whole app. It is saved on every change and restored on load. */
export default class AuthService extends Service {
  session = machine(this, new Auth())

  constructor(...args: ConstructorParameters<typeof Service>) {
    super(...args)
    try {
      const saved = localStorage.getItem(KEY)
      const result = saved ? Auth.schema()['~standard'].validate(JSON.parse(saved)) : undefined
      // A snapshot from an older version of the machine fails validation and is ignored.
      if (result && 'value' in result) this.session.restore(result.value)
    } catch {
      // Private windows can refuse storage; the session just starts logged out.
    }
    this.session.subscribe(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.session.snapshot()))
      } catch {
        // As above: nothing to save to.
      }
    })
  }
}
