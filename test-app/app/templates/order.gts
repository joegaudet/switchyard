import { on } from '@ember/modifier'
import { send } from '@switchyard/ember'
import type OrderController from 'test-app/controllers/order'

<template>
  <p data-test-step>{{@controller.order.state.label}}</p>
  <button type="button" data-test-ship {{on "click" (send @controller.order "ship")}}>Ship</button>
</template> satisfies import('@ember/component/template-only').TOC<{ Args: { controller: OrderController } }>
