import { Enum, type EnumClass } from '@real-enums/core'

export interface StateOptions {
  /** The child states of a compound state, as their own enum. */
  children?: EnumClass<State>
  /** Re-entering through `.history` resumes the last active child (shallow) or descendant (deep). */
  history?: 'shallow' | 'deep'
  /** Entering a final state completes its parent. */
  final?: boolean
}

/**
 * A state is a real enum value that also carries its statechart options:
 * `static Loading = Fetch.of('loading', { children: Attempt })`.
 */
export class State extends Enum {
  readonly children: EnumClass<State> | undefined
  readonly history: 'shallow' | 'deep' | undefined
  readonly final: boolean

  constructor(value: string, options: StateOptions = {}) {
    super(value)
    if (options.history && !options.children)
      throw new Error(`${new.target.name}.${value}: history needs children`)
    this.children = options.children
    this.history = options.history
    this.final = options.final ?? false
  }
}

export {
  createInterpreter,
  type Action,
  type ActionApi,
  type EventObject,
  type Guard,
  type Interpreter,
  type MachineConfig,
  type StateConfig,
  type Status,
  type TransitionConfig,
} from './interpreter.js'
