import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'

import User from '#models/user'

/**
 * Vérifie le schéma produit par la migration `create_users_table` :
 * colonnes attendues (`id`, `email`, `password`, `created_at`, `updated_at`),
 * unicité de l'email et horodatage automatique par Lucid.
 */
test.group('Migration users | schéma de la table', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('la table users expose les colonnes attendues', async ({ assert }) => {
    const rows = await db.rawQuery('PRAGMA table_info(users)')
    const columns = rows.map((row: { name: string }) => row.name)

    for (const column of ['id', 'email', 'password', 'created_at', 'updated_at']) {
      assert.include(columns, column)
    }
  })

  test('les timestamps sont renseignés automatiquement', async ({ assert }) => {
    const user = await User.create({ email: 'hedy@example.com', password: 'secret-password' })

    assert.isNotNull(user.createdAt)
    assert.isNotNull(user.updatedAt)
  })

  test('deux utilisateurs ne peuvent pas partager le même email', async ({ assert }) => {
    await User.create({ email: 'doublon@example.com', password: 'secret-password' })

    await assert.rejects(() =>
      User.create({ email: 'doublon@example.com', password: 'autre-password' })
    )
  })
})
