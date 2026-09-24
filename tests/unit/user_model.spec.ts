import { test } from '@japa/runner'
import hash from '@adonisjs/core/services/hash'
import testUtils from '@adonisjs/core/services/test_utils'

import User from '#models/user'

/**
 * Vérifie le comportement apporté au modèle `User` par le mixin `withAuthFinder` :
 * hachage automatique du mot de passe, vérification des identifiants et recherche
 * par uid. Le schéma de la table est couvert par `users_migration.spec.ts`.
 */
test.group('User model | hachage automatique du mot de passe', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('le mot de passe est haché à la création', async ({ assert }) => {
    const user = await User.create({
      email: 'ada@example.com',
      password: 'secret-password',
    })

    assert.notEqual(user.password, 'secret-password')
    assert.isTrue(hash.isValidHash(user.password))
    assert.isTrue(await hash.verify(user.password, 'secret-password'))
  })

  test('le mot de passe est ré-haché lors d’une mise à jour', async ({ assert }) => {
    const user = await User.create({ email: 'grace@example.com', password: 'ancien-password' })
    const previousHash = user.password

    user.password = 'nouveau-password'
    await user.save()

    assert.notEqual(user.password, previousHash)
    assert.isTrue(await hash.verify(user.password, 'nouveau-password'))
  })

  test('sauvegarder sans toucher au mot de passe ne le re-hache pas', async ({ assert }) => {
    const user = await User.create({ email: 'linus@example.com', password: 'secret-password' })
    const previousHash = user.password

    user.fullName = 'Linus T'
    await user.save()

    assert.equal(user.password, previousHash)
  })

  test('verifyCredentials retrouve l’utilisateur avec le bon mot de passe', async ({ assert }) => {
    await User.create({ email: 'alan@example.com', password: 'secret-password' })

    const user = await User.verifyCredentials('alan@example.com', 'secret-password')
    assert.equal(user.email, 'alan@example.com')

    await assert.rejects(() => User.verifyCredentials('alan@example.com', 'mauvais-password'))
  })

  test('le mot de passe n’est jamais sérialisé', async ({ assert }) => {
    const user = await User.create({ email: 'katherine@example.com', password: 'secret-password' })

    assert.notProperty(user.serialize(), 'password')
  })

  test('findForAuth retrouve l’utilisateur par son email', async ({ assert }) => {
    await User.create({ email: 'barbara@example.com', password: 'secret-password' })

    const user = await User.findForAuth(['email'], 'barbara@example.com')
    assert.equal(user?.email, 'barbara@example.com')
  })

  test('findForAuth renvoie null pour un email inconnu', async ({ assert }) => {
    assert.isNull(await User.findForAuth(['email'], 'inconnu@example.com'))
  })
})
