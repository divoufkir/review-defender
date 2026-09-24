import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'

/**
 * Vérifie le schéma produit par la migration `create_users_table`.
 *
 * Ce fichier reste volontairement au niveau du schéma SQL (colonnes, types,
 * contraintes). Les comportements du modèle (hachage, timestamps automatiques,
 * unicité vue depuis Lucid) sont couverts par `tests/unit/user_model.spec.ts`.
 */
test.group('Migration users | schéma de la table', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  type ColumnInfo = { name: string; type: string; notnull: number; pk: number }

  async function tableInfo(): Promise<ColumnInfo[]> {
    return db.rawQuery('PRAGMA table_info(users)')
  }

  test('la table users expose les colonnes attendues', async ({ assert }) => {
    const columns = (await tableInfo()).map((column) => column.name)

    for (const column of ['id', 'email', 'password', 'created_at', 'updated_at']) {
      assert.include(columns, column)
    }
  })

  test('id est la clé primaire entière auto-incrémentée', async ({ assert }) => {
    const id = (await tableInfo()).find((column) => column.name === 'id')!

    assert.equal(id.pk, 1)
    assert.equal(id.type.toLowerCase(), 'integer')
  })

  test('email, password et created_at sont NOT NULL', async ({ assert }) => {
    const columns = await tableInfo()

    for (const name of ['email', 'password', 'created_at']) {
      assert.equal(columns.find((column) => column.name === name)!.notnull, 1, name)
    }
  })

  test('un index unique protège la colonne email au niveau SQL', async ({ assert }) => {
    const indexes: { name: string; unique: number }[] = await db.rawQuery(
      'PRAGMA index_list(users)'
    )

    const uniqueOnEmail = await Promise.all(
      indexes
        .filter((index) => index.unique === 1)
        .map(async (index) => {
          const info: { name: string }[] = await db.rawQuery(
            `PRAGMA index_info(${JSON.stringify(index.name)})`
          )
          return info.map((column) => column.name)
        })
    )

    assert.isTrue(uniqueOnEmail.some((columns) => columns.length === 1 && columns[0] === 'email'))
  })

  test('insérer un utilisateur sans mot de passe est refusé', async ({ assert }) => {
    await assert.rejects(() =>
      db.table('users').insert({ email: 'sans-password@example.com', created_at: new Date() })
    )
  })
})
