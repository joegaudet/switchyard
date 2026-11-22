import { module, test } from 'qunit'
import { setupRenderingTest } from 'ember-qunit'
import { render, settled } from '@ember/test-helpers'
import { SwitchyardAnnouncer } from '@switchyard-ts/ember'
import { OrderFlow } from 'test-app/machines'

module('<SwitchyardAnnouncer>', function (hooks) {
  setupRenderingTest(hooks)

  test('announces each state that has a message, in a polite live region', async function (assert) {
    const order = new OrderFlow().start()
    const messages = { shipped: 'Your order has shipped', delivered: 'Delivered' }
    await render(<template><SwitchyardAnnouncer @machine={{order}} @messages={{messages}} /></template>)

    assert.dom('[role=status]').hasAttribute('aria-live', 'polite').hasText('')
    order.ship()
    await settled()
    assert.dom('[role=status]').hasText('Your order has shipped')
    order.deliver()
    await settled()
    assert.dom('[role=status]').hasText('Delivered')
  })
})
