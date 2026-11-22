// Ember-style source: legacy decorators on `declare` fields.
import { is } from '@real-enums/core'
import { Machine, State, transition } from '@switchyard-ts/core'

export class Light extends State {
  declare private readonly brand: never
  static Red = Light.of('red')
  static Green = Light.of('green')

  @is() declare isRed: boolean
}

export class Signal extends Machine<Light> {
  @transition({ from: Light.Red, to: Light.Green })
  go() {}
}
