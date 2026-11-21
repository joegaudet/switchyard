import { describe, expect, it } from 'vitest'
import { bindField, Machine, State, transition } from '../../src/index.js'
import { Attempt, Editor, Fetch, FetchState, Toggle } from './machines.standard.js'

class Saved extends Fetch {
  static override persist = ['data', 'retries']
}

class Order extends State {
  static Pending = Order.of('pending')
  static Shipped = Order.of('shipped')
  static Delivered = Order.of('delivered')
}

class OrderFlow extends Machine<Order> {
  @transition({ from: Order.Pending, to: Order.Shipped })
  ship() {}

  @transition({ from: Order.Shipped, to: Order.Delivered })
  deliver() {}
}

describe('Machine snapshot and restore', () => {
  it('round-trips state, child states, history and persisted context through JSON', () => {
    const a = new Saved()
    a.fetch()
    a.stall()
    a.reject()
    a.retries = 1
    const json = JSON.parse(JSON.stringify(a.snapshot()))
    expect(json.context).toEqual({ data: undefined, retries: 1 })

    const b = new Saved().restore(json)
    expect(b.state).toBe(FetchState.Failed)
    expect(b.retries).toBe(1)
    expect(b.log).toEqual([])
    b.retry()
    expect(b.matches(Attempt.Retrying)).toBe(true)
    expect(b.log).toEqual(['enter loading'])
  })

  it('round-trips parallel regions', () => {
    const a = new Editor()
    a.toggleBold()
    const b = new Editor().restore(a.snapshot())
    expect(b.state).toEqual({ bold: Toggle.On, italic: Toggle.Off })
  })

  it('restore() rejects a snapshot that does not fit the machine', () => {
    expect(() => new Fetch().restore({ configuration: ['shipped'] })).toThrow(
      /unknown state "shipped"/,
    )
  })

  it('schema() is a Standard Schema for snapshots of the class', () => {
    const schema = Fetch.schema()
    expect(schema['~standard'].vendor).toBe('switchyard')
    const ok = schema['~standard'].validate({ configuration: ['loading.retrying'] })
    expect(ok).toEqual({ value: { configuration: ['loading.retrying'] } })
    const bad = schema['~standard'].validate({ configuration: ['idle', 'done'] })
    expect('issues' in bad && bad.issues[0]?.message).toMatch(/both "idle" and "done"/)
    const notASnapshot = schema['~standard'].validate('idle')
    expect('issues' in notASnapshot && notASnapshot.issues[0]?.message).toMatch(/configuration/)
  })
})

describe('bindField', () => {
  it('mirror: starts from a record attribute and writes each transition back', () => {
    const record = { status: 'shipped' }
    const m = new OrderFlow()
    bindField(m, record, 'status')
    expect(m.state).toBe(Order.Shipped)
    m.deliver()
    expect(record.status).toBe('delivered')
  })

  it('mirror: an empty attribute leaves the machine at its initial state and writes it', () => {
    const record: { status?: string } = {}
    const m = new OrderFlow()
    bindField(m, record, 'status')
    expect(record.status).toBe('pending')
  })

  it('accessor: the property reads the state and writing it restores the machine', () => {
    const controller = {} as { step: string }
    const m = new OrderFlow()
    bindField(m, controller, 'step', { mode: 'accessor' })
    expect(controller.step).toBe('pending')
    m.ship()
    expect(controller.step).toBe('shipped')
    controller.step = 'delivered'
    expect(m.state).toBe(Order.Delivered)
  })
})
