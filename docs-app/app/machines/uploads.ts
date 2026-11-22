import { tracked } from '@glimmer/tracking'
import { after, always, Machine, State, transition } from '@switchyard-ts/core'

export class Upload extends State {
  declare private readonly brand: never
  static Sending = Upload.of('sending')
  static Sent = Upload.of('sent', { final: true })
  static Cancelled = Upload.of('cancelled', { final: true })
}

/** One file: progress ticks on a timer until it is sent; it tells its queue when it is done. */
export class FileUpload extends Machine<Upload> {
  @tracked progress = 0

  constructor(readonly file: string) {
    super()
  }

  @after(150, { from: Upload.Sending, to: Upload.Sending, reenter: true })
  tick() {
    this.progress = Math.min(100, this.progress + 10 + Math.round(Math.random() * 15))
    if (this.progress === 100) this.done()
  }

  @transition({ from: Upload.Sending, to: Upload.Sent })
  done() {
    this.sendParent('finished', this.file)
  }

  @transition({ from: Upload.Sending, to: Upload.Cancelled })
  cancel() {
    this.sendParent('finished', this.file)
  }
}

export class Queue extends State {
  declare private readonly brand: never
  static Idle = Queue.of('idle')
  static Busy = Queue.of('busy')
}

export class Uploader extends Machine<Queue> {
  @tracked files: FileUpload[] = []
  @tracked completed = 0

  // Children report in as they finish (or are cancelled); counting is enough.
  get allDone() {
    return this.completed === this.files.length
  }

  @transition({ to: Queue.Busy })
  add(file: string) {
    this.files = [...this.files, this.spawn(new FileUpload(file), { id: file })]
  }

  @transition({ from: Queue.Busy })
  finished(_file: string) {
    this.completed++
  }

  @always({ from: Queue.Busy, to: Queue.Idle, guard: (m: Uploader) => m.allDone })
  settle() {}
}
