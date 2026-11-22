import { Enum, type EnumClass } from '@real-enums/core'

export interface StateOptions<C extends State = State> {
  /** The child states of a compound state, as their own enum. */
  children?: EnumClass<C>
  /** Re-entering through `.history` resumes the last active child (shallow) or descendant (deep). */
  history?: 'shallow' | 'deep'
  /** Entering a final state completes its parent. */
  final?: boolean
  /** Parallel regions inside this state, each with its own enum: `{ bold: Toggle, italic: Toggle }`. */
  regions?: Record<string, EnumClass<C>>
}

// Type-only: carries a state enum's `C`. A parameter position, so `State<C>` is still a `State`.
declare const CHILDREN: unique symbol

/** The enums `S` names as its children and regions: `Attempt`, for `FetchState extends State<Attempt>`. */
export type ChildrenOf<S> = S extends { readonly [CHILDREN]?: (children: infer C) => void }
  ? C
  : never

/**
 * A state is a real enum value that also carries its statechart options:
 * `static Loading = Fetch.of('loading', { children: Attempt })`, in `class Fetch extends
 * State<Attempt>`: the type param names the enums of its children and regions, so `m.can()` and
 * `m.matches()` accept their states.
 *
 * Each enum declares `private declare readonly brand: never`. TypeScript compares classes by
 * shape, and a private member is the one thing that tells two state enums apart.
 */
export class State<C extends State = never> extends Enum {
  declare readonly [CHILDREN]?: (children: C) => void
  readonly children: EnumClass<State> | undefined
  readonly history: 'shallow' | 'deep' | undefined
  readonly final: boolean
  readonly regions: Record<string, EnumClass<State>> | undefined

  constructor(value: string, options: StateOptions<C> = {}) {
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
