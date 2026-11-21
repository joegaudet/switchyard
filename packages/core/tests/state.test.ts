import { Enum } from '@real-enums/core'
import { describe, expect, it } from 'vitest'
import { State } from '../src/index.js'

class Attempt extends State {
  static First = Attempt.of('first')
  static Retrying = Attempt.of('retrying')
}

class Fetch extends State {
  static Idle = Fetch.of('idle')
  static Loading = Fetch.of('loading', { children: Attempt, history: 'shallow' })
  static Done = Fetch.of('done', { final: true })
}

describe('State', () => {
  it('is a real enum', () => {
    expect(Fetch.Idle).toBeInstanceOf(Enum)
    expect(Fetch.values).toEqual([Fetch.Idle, Fetch.Loading, Fetch.Done])
    expect(Fetch.valueFor('loading')).toBe(Fetch.Loading)
  })

  it('carries statechart options on the value', () => {
    expect(Fetch.Loading.children).toBe(Attempt)
    expect(Fetch.Loading.history).toBe('shallow')
    expect(Fetch.Done.final).toBe(true)
  })

  it('defaults to an atomic, non-final state', () => {
    expect(Fetch.Idle.children).toBeUndefined()
    expect(Fetch.Idle.history).toBeUndefined()
    expect(Fetch.Idle.final).toBe(false)
  })

  it('rejects history on an atomic state', () => {
    class Bad extends State {}
    expect(() => Bad.of('x', { history: 'deep' })).toThrow(/history needs children/)
  })
})
