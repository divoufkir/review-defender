import { test } from '@japa/runner'
import hash from '@adonisjs/core/services/hash'
import testUtils from '@adonisjs/core/services/test_utils'

import User from '#models/user'

test.group('User model', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('hache automatiquement le mot de passe à la création', async ({ assert }) => {
    const user = await User.create({
      email: 'jane@example.com',
      password: 'secret-password',
    })

    assert.notEqual(user.password, 'secret-password')
    assert.isTrue(await hash.verify(user.password, 'secret-password'))
  })

  test('ne re-hache pas un mot de passe inchangé', async ({ assert }) => {
    const user = await User.create({
      email: 'john@example.com',
      password: 'secret-password',
    })

    const initialHash = user.password
    user.fullName = 'John Doe'
    await user.save()

    assert.equal(user.password, initialHash)
  })

  test('verifyCredentials retrouve l’utilisateur avec le bon mot de passe', async ({ assert }) => {
    await User.create({ email: 'ada@example.com', password: 'secret-password' })

    const user = await User.verifyCredentials('ada@example.com', 'secret-password')
    assert.equal(user.email, 'ada@example.com')
  })
})
