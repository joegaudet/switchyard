import { Machine, region, State, transition } from '@switchyard-ts/core'

export class Toggle extends State {
  static Off = Toggle.of('off')
  static On = Toggle.of('on')
}

export class Align extends State {
  static Left = Align.of('left')
  static Center = Align.of('center')
  static Right = Align.of('right')
}

export class Formatting extends Machine<{ bold: Toggle; italic: Toggle; align: Align }> {
  @region(Toggle) declare bold: Toggle
  @region(Toggle) declare italic: Toggle
  @region(Align) declare align: Align

  @transition({ in: 'bold', from: Toggle.Off, to: Toggle.On })
  @transition({ in: 'bold', from: Toggle.On, to: Toggle.Off })
  toggleBold() {}

  @transition({ in: 'italic', from: Toggle.Off, to: Toggle.On })
  @transition({ in: 'italic', from: Toggle.On, to: Toggle.Off })
  toggleItalic() {}

  @transition({ to: Align.Left })
  alignLeft() {}

  @transition({ to: Align.Center })
  alignCenter() {}

  @transition({ to: Align.Right })
  alignRight() {}
}
