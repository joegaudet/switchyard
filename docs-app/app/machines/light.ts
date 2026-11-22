import { after, Machine, State, transition } from '@switchyard/core'

export class Crossing extends State {
  static Wait = Crossing.of('wait')
  static Walk = Crossing.of('walk')
}

export class Light extends State {
  static Green = Light.of('green')
  static Yellow = Light.of('yellow')
  static Red = Light.of('red', { children: Crossing })
  static Off = Light.of('off', { final: true })
}

export class TrafficLight extends Machine<Light> {
  @after(2000, { from: Light.Green, to: Light.Yellow })
  slowDown() {}

  @after(1000, { from: Light.Yellow, to: Light.Red })
  turnRed() {}

  @after(800, { from: Crossing.Wait, to: Crossing.Walk })
  walk() {}

  @after(2500, { from: Light.Red, to: Light.Green })
  go() {}

  @transition({ to: Light.Off })
  powerCut() {}
}
