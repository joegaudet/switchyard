import Controller from '@ember/controller'
import { bindField } from '@switchyard-ts/core'
import { OrderFlow } from 'test-app/machines'

export default class OrderController extends Controller {
  queryParams = ['step']
  declare step: string
  order = new OrderFlow()

  constructor(...args: ConstructorParameters<typeof Controller>) {
    super(...args)
    bindField(this.order, this, 'step', { mode: 'accessor' })
  }
}
