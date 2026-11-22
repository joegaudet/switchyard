import { Enum, type EnumClass } from '@real-enums/core'

export interface StateOptions {
  /** The child states of a compound state, as their own enum. */
  children?: EnumClass<State>
  /** Re-entering through `.history` resumes the last active child (shallow) or descendant (deep). */
  history?: 'shallow' | 'deep'
  /** Entering a final state completes its parent. */
  final?: boolean
  /** Parallel regions inside this state, each with its own enum: `{ bold: Toggle, italic: Toggle }`. */
  regions?: Record<string, EnumClass<State>>
}

/**
 * A state is a real enum value that also carries its statechart options:
 * `static Loading = Fetch.of('loading', { children: Attempt })`.
 */
export class State extends Enum {
  readonly children: EnumClass<State> | undefined
  readonly history: 'shallow' | 'deep' | undefined
  readonly final: boolean
  readonly regions: Record<string, EnumClass<State>> | undefined

  constructor(value: string, options: StateOptions = {}) {
    super(value)
    if (options.children && options.regions)
      throw new Error(`${new.target.name}.${value}: children or regions, not both`)
    if (options.history && !options.children && !options.regions)
      throw new Error(`${new.target.name}.${value}: history needs children`)
    this.children = options.children
    this.regions = options.regions
    this.history = options.history
    this.final = options.final ?? false
  }
}
