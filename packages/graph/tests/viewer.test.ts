// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { defineDiagramElement, mountDiagram, type SwitchyardDiagram } from '../src/viewer.js'
import { Fetch } from './fixtures.js'

afterEach(() => void vi.useRealTimers())

const active = (host: Element) =>
  [...host.querySelectorAll('.sy-active')].map(el => el.getAttribute('data-state'))

it('marks the active states and follows transitions', async () => {
  const host = document.createElement('div')
  const m = new Fetch()
  const off = await mountDiagram(host, m)
  expect(active(host)).toEqual(['idle'])
  m.fetch('/user')
  expect(active(host)).toEqual(['loading', 'loading.first'])
  off()
  m.stall()
  expect(active(host)).toEqual(['loading', 'loading.first'])
})

it('flashes the transition taken', async () => {
  const host = document.createElement('div')
  const m = new Fetch()
  await mountDiagram(host, m)
  // After the layout: ELK's own scheduling uses setTimeout.
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  m.fetch('/user')
  const taken = () => host.querySelector('.sy-taken')?.getAttribute('data-event')
  expect(taken()).toBe('fetch')
  vi.advanceTimersByTime(600)
  expect(taken()).toBeUndefined()
})

it('<switchyard-diagram> draws the machine assigned to it', async () => {
  defineDiagramElement()
  const el = document.createElement('switchyard-diagram') as SwitchyardDiagram
  document.body.append(el)
  el.machine = new Fetch()
  await vi.waitFor(() => expect(el.querySelector('svg')).not.toBeNull())
  expect(active(el)).toEqual(['idle'])
  el.remove()
})
