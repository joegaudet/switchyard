import { createInspector } from '@statelyai/inspect'
import { Machine, region, State, transition } from '@switchyard-ts/core'
import { describe, expect, it } from 'vitest'
import { connectInspector, toXStateValue } from '../src/index.js'

class Step extends State {
  static Sending = Step.of('sending')
  static Sent = Step.of('sent', { final: true })
}

class FileUpload extends Machine<Step> {
  @transition({ from: Step.Sending, to: Step.Sent })
  finish() {}
}

class Queue extends State {
  static Idle = Queue.of('idle')
  static Working = Queue.of('working')
}

class Uploader extends Machine<Queue> {
  @transition({ from: Queue.Idle, to: Queue.Working })
  start_() {}

  add(name: string) {
    return this.spawn(new FileUpload(), { id: name })
  }
}

class Toggle extends State {
  static Off = Toggle.of('off')
  static On = Toggle.of('on')
}

class Editor extends Machine<{ bold: Toggle; italic: Toggle }> {
  @region(Toggle) accessor bold!: Toggle
  @region(Toggle) accessor italic!: Toggle
}

describe('toXStateValue', () => {
  it('nests leaf paths the way xstate writes state values', () => {
    expect(toXStateValue(['idle'])).toBe('idle')
    expect(toXStateValue(['loading.retrying'])).toEqual({ loading: 'retrying' })
    expect(toXStateValue(['bold.on', 'italic.off'])).toEqual({ bold: 'on', italic: 'off' })
    expect(toXStateValue(['p.a.x', 'p.b'])).toEqual({ p: { a: 'x', b: {} } })
  })
})

describe('connectInspector', () => {
  it("speaks the Stately inspection protocol through the library's own inspector", () => {
    const sent: { type: string; sessionId: string; [k: string]: unknown }[] = []
    const inspector = createInspector({ send: e => void sent.push(e as never) })
    const m = new Uploader()
    connectInspector(m, inspector, { sessionId: 'uploader' })
    m.start_()
    const child = m.add('a.txt')
    child.finish()

    const actors = sent.filter(e => e.type === '@xstate.actor')
    expect(actors.map(a => [a.sessionId, a['parentId'], a['rootId'], a['name']])).toEqual([
      // A root actor has no rootId in @statelyai/inspect (getRoot starts from _parent).
      ['uploader', undefined, undefined, 'Uploader'],
      ['uploader/a.txt', 'uploader', 'uploader', 'FileUpload'],
    ])
    expect(JSON.parse(actors[0]!['definition'] as string)).toMatchObject({
      id: 'Uploader',
      initial: 'idle',
    })
    const snapshots = sent.filter(e => e.type === '@xstate.snapshot')
    expect(snapshots.map(s => [s.sessionId, (s['snapshot'] as { value: unknown }).value])).toEqual([
      ['uploader', 'idle'],
      ['uploader', 'working'],
      ['uploader/a.txt', 'sending'],
      ['uploader/a.txt', 'sent'],
    ])
    expect(
      sent
        .filter(e => e.type === '@xstate.event')
        .map(e => [e.sessionId, (e['event'] as { type: string }).type]),
    ).toEqual([
      ['uploader', 'start_'],
      ['uploader/a.txt', 'finish'],
    ])
  })

  it('sends parallel values and stops when disconnected', () => {
    const calls: string[] = []
    const fake = {
      actor: () => void calls.push('actor'),
      event: () => void calls.push('event'),
      snapshot: (_id: unknown, s: { value?: unknown }) => void calls.push(JSON.stringify(s.value)),
    }
    const m = new Editor()
    const off = connectInspector(m, fake)
    expect(calls).toEqual(['actor', '{"bold":"off","italic":"off"}'])
    off()
    m.send('anything')
    expect(calls).toHaveLength(2)
  })
})
