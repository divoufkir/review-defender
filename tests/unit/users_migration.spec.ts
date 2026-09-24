import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'

/**
 * Vérifie le schéma produit par la migration `create_users_table` :
 * présence des colonnes attendues (`id`, `email`, `password`, `created_at`,
 * `updated_at`) et contraintes réellement appliquées par la base (clé primaire,
 * NOT NULL, index unique sur l'email).
 *
 * Le comportement applicatif (hachage du mot de passe, horodatage automatique,
 * rejet d'un email en doublon) est couvert par `tests/unit/user_model.spec.ts`.
 */
type ColumnInfo = { name: string; type: string; notnull: number; pk: number }

test.group('Migration users | schéma de la table', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('la table users expose les colonnes attendues', async ({ assert }) => {
    const columns: ColumnInfo[] = await db.rawQuery('PRAGMA table_info(users)')
    const names = columns.map((column) => column.name)

    for (const column of ['id', 'email', 'password', 'created_at', 'updated_at']) {
      assert.include(names, column)
    }
  })

  test('id est la clé primaire auto-incrémentée', async ({ assert }) => {
    const columns: ColumnInfo[] = await db.rawQuery('PRAGMA table_info(users)')
    const id = columns.find((column) => column.name === 'id')

    assert.exists(id)
    assert.equal(id!.pk, 1)
  })

  test('email, password et created_at sont NOT NULL', async ({ assert }) => {
    const columns: ColumnInfo[] = await db.rawQuery('PRAGMA table_info(users)')

    for (const name of ['email', 'password', 'created_at']) {
      const column = columns.find((candidate) => candidate.name === name)
      assert.exists(column, `colonne ${name} absente`)
      assert.equal(column!.notnull, 1, `colonne ${name} devrait être NOT NULL`)
    }
  })

  test('full_name et updated_at restent nullables', async ({ assert }) => {
    const columns: ColumnInfo[] = await db.rawQuery('PRAGMA table_info(users)')

    for (const name of ['full_name', 'updated_at']) {
      const column = columns.find((candidate) => candidate.name === name)
      assert.exists(column, `colonne ${name} absente`)
      assert.equal(column!.notnull, 0, `colonne ${name} devrait être nullable`)
    }
  })

  test('un index unique couvre la colonne email', async ({ assert }) => {
    const indexes: { name: string; unique: number }[] = await db.rawQuery(
      'PRAGMA index_list(users)'
    )

    const uniqueOnEmail = await Promise.all(
      indexes
        .filter((index) => index.unique === 1)
        .map(async (index) => {
          const info: { name: string }[] = await db.rawQuery(`PRAGMA index_info(${index.name})`)
          return info.map((column) => column.name)
        })
    )

    assert.isTrue(uniqueOnEmail.some((columns) => columns.length === 1 && columns[0] === 'email'))
  })
})
