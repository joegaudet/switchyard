import { module, test } from 'qunit'
import { setupRenderingTest } from 'ember-qunit'
import { render, waitUntil } from '@ember/test-helpers'
import { SwitchyardDebug } from '@switchyard-ts/ember/debug'
import { OrderFlow } from 'test-app/machines'

module('<SwitchyardDebug>', function (hooks) {
  setupRenderingTest(hooks)

  test('draws the live statechart and follows transitions', async function (assert) {
    const order = new OrderFlow()
    await render(<template><SwitchyardDebug @machine={{order}} data-test-debug /></template>)
    await waitUntil(() => document.querySelector('[data-test-debug] svg'))

    const active = () =>
      [...document.querySelectorAll('[data-test-debug] .sy-active')].map(el =>
        el.getAttribute('data-state'),
      )
    assert.deepEqual(active(), ['pending'])
    order.ship()
    assert.deepEqual(active(), ['shipped'])
  })
})
