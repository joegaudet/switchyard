import Component from '@glimmer/component'
import { on } from '@ember/modifier'
import { Form } from '@ember-formwright/ember'
import { can, machine, matches, send } from '@switchyard/ember'
import { Example } from 'docs-app/components/example'
import { Details, SignupWizard, Step } from 'docs-app/machines/wizard'
import source from 'docs-app/machines/wizard.ts?raw'

const not = (v: boolean) => !v

export default class WizardDemo extends Component {
  wizard = machine(this, new SignupWizard())

  // Formwright edits its own draft; each change is copied to the machine's tracked signup,
  // which its guards read.
  draft = { name: '', email: '' }
  changed = () => (this.wizard.signup = { ...this.draft })

  <template>
    <Example @title="A signup wizard on Formwright" @machine={{this.wizard}} @source={{source}}>
      {{#if (matches this.wizard Step.Details)}}
        <Form @model={{this.draft}} @onChange={{this.changed}} as |f|>
          {{#if (matches this.wizard Details.Name)}}
            <f.Field @for="name" @control="text" @label="Your name" />
            <button type="button" disabled={{not (can this.wizard "next")}} {{on "click" (send this.wizard "next")}}>Next</button>
          {{else}}
            <f.Field @for="email" @control="email" @label="Email" />
            <button type="button" class="secondary" {{on "click" (send this.wizard "previous")}}>Back</button>
            <button type="button" disabled={{not (can this.wizard "review")}} {{on "click" (send this.wizard "review")}}>Review</button>
          {{/if}}
        </Form>
      {{else if (matches this.wizard Step.Review)}}
        <p><strong>{{this.wizard.signup.name}}</strong> &lt;{{this.wizard.signup.email}}&gt;</p>
        <button type="button" class="secondary" {{on "click" (send this.wizard "edit")}}>Edit</button>
        <button type="button" {{on "click" (send this.wizard "submit")}}>Sign up</button>
        <p><small>Edit goes back to the step you left, via deep history.</small></p>
      {{else}}
        <p>Welcome aboard, {{this.wizard.signup.name}}.</p>
      {{/if}}
    </Example>
  </template>
}
