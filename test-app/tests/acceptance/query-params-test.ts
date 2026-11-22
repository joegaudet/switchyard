import { module, test } from 'qunit'
import { setupApplicationTest } from 'ember-qunit'
import { click, currentURL, visit } from '@ember/test-helpers'

module('bindField as a query param', function (hooks) {
  setupApplicationTest(hooks)

  test('the URL restores the machine', async function (assert) {
    await visit('/order?step=shipped')
    assert.dom('[data-test-step]').hasText('Shipped')
  })

  test('a transition updates the URL', async function (assert) {
    await visit('/order')
    assert.dom('[data-test-step]').hasText('Pending')
    await click('[data-test-ship]')
    assert.dom('[data-test-step]').hasText('Shipped')
    assert.strictEqual(currentURL(), '/order?step=shipped')
  })
})
