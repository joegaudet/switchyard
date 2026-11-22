import { tracked } from '@glimmer/tracking'
import { history, Machine, State, transition } from '@switchyard/core'

export class Details extends State {
  static Name = Details.of('name')
  static Email = Details.of('email')
}

export class Step extends State {
  static Details = Step.of('details', { children: Details, history: 'deep' })
  static Review = Step.of('review')
  static Submitted = Step.of('submitted', { final: true })
}

export interface Signup {
  name: string
  email: string
}

export class SignupWizard extends Machine<Step> {
  @tracked signup: Signup = { name: '', email: '' }

  get hasName() {
    return this.signup.name.trim().length > 0
  }

  get hasEmail() {
    return /.+@.+/.test(this.signup.email)
  }

  @transition({ from: Details.Name, to: Details.Email, guard: 'hasName' })
  next() {}

  @transition({ from: Details.Email, to: Details.Name })
  previous() {}

  @transition({ from: Details.Email, to: Step.Review, guard: 'hasEmail' })
  review() {}

  @transition({ from: Step.Review, to: history(Step.Details) })
  edit() {}

  @transition({ from: Step.Review, to: Step.Submitted })
  submit() {}
}
