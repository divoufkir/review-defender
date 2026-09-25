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

  test('email est déclaré varchar(254), la limite RFC 5321', async ({ assert }) => {
    const columns: ColumnInfo[] = await db.rawQuery('PRAGMA table_info(users)')
    const email = columns.find((column) => column.name === 'email')

    assert.equal(email!.type.toLowerCase(), 'varchar(254)')
  })

  test('password est stocké en varchar(255), assez large pour un hash scrypt', async ({
    assert,
  }) => {
    const columns: ColumnInfo[] = await db.rawQuery('PRAGMA table_info(users)')
    const password = columns.find((column) => column.name === 'password')

    // La colonne accueille le hash produit par le mixin `withAuthFinder`
    // (format `#scrypt#...`), jamais le mot de passe en clair.
    assert.equal(password!.type.toLowerCase(), 'varchar(255)')
  })

  test('id s’auto-incrémente à chaque insertion', async ({ assert }) => {
    // `pk = 1` prouve seulement que la colonne est clé primaire : il faut deux
    // insertions sans `id` explicite pour vérifier l'auto-incrément réel.
    const [first] = await db
      .table('users')
      .insert({ email: 'inc-a@example.com', password: 'hash', created_at: new Date() })
      .returning('id')
    const [second] = await db
      .table('users')
      .insert({ email: 'inc-b@example.com', password: 'hash', created_at: new Date() })
      .returning('id')

    assert.isAbove(Number(second.id ?? second), Number(first.id ?? first))
  })

  test('la table n’expose aucune colonne inattendue', async ({ assert }) => {
    const columns: ColumnInfo[] = await db.rawQuery('PRAGMA table_info(users)')

    // Les assertions précédentes vérifient que les colonnes attendues sont
    // présentes ; celle-ci verrouille l'inverse, pour qu'une colonne ajoutée par
    // erreur à la migration initiale (au lieu d'une nouvelle migration) échoue.
    assert.deepEqual(columns.map((column) => column.name).sort(), [
      'created_at',
      'email',
      'full_name',
      'id',
      'password',
      'updated_at',
    ])
  })

  test('id est une colonne entière et les timestamps sont datés', async ({ assert }) => {
    const columns: ColumnInfo[] = await db.rawQuery('PRAGMA table_info(users)')
    const typeOf = (name: string) =>
      columns.find((column) => column.name === name)!.type.toLowerCase()

    assert.equal(typeOf('id'), 'integer')
    assert.equal(typeOf('created_at'), 'datetime')
    assert.equal(typeOf('updated_at'), 'datetime')
  })
})

/**
 * Couvre la méthode `down()` de la migration, seule partie du fichier que les
 * assertions précédentes n'exercent pas : elles inspectent l'état de la base
 * après `up()`, jamais le retour arrière.
 *
 * La migration est instanciée directement plutôt que rejouée via `node ace
 * migration:rollback` : un `DROP TABLE` est une opération DDL, que SQLite ne
 * peut pas isoler dans la transaction globale utilisée par les autres groupes.
 * La table est donc recréée dans le teardown pour laisser la base intacte.
 */
test.group('Migration users | retour arrière', (group) => {
  group.each.teardown(async () => {
    const hasTable = await db.connection().schema.hasTable('users')
    if (!hasTable) {
      const migration = await createMigration()
      await migration.execUp()
    }
  })

  test('down() supprime la table users', async ({ assert }) => {
    const migration = await createMigration()

    await migration.execDown()

    assert.isFalse(await db.connection().schema.hasTable('users'))
  })

  test('up() recrée la table après un rollback', async ({ assert }) => {
    const down = await createMigration()
    await down.execDown()

    const up = await createMigration()
    await up.execUp()

    assert.isTrue(await db.connection().schema.hasTable('users'))
  })
})

/**
 * Instancie la migration `create_users_table` hors du migrateur. On passe par
 * `execUp()` / `execDown()`, qui appellent eux-mêmes `up()` / `down()` puis
 * exécutent les requêtes empilées : appeler `up()` / `down()` seuls ne ferait
 * que les empiler, sans rien exécuter. Chaque appel retourne une instance neuve,
 * car `exec*()` marque ensuite l'instance « completed », qui refuse toute
 * nouvelle exécution.
 */
async function createMigration() {
  const file = 'database/migrations/1761885935168_create_users_table'
  const { default: CreateUsersTable } =
    await import('#database/migrations/1761885935168_create_users_table')

  return new CreateUsersTable(db.connection(), file, false)
}
