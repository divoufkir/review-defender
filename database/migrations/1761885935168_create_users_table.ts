import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Table `users` : socle de l'authentification de l'application.
 *
 * Colonnes :
 * - `id`         : clé primaire auto-incrémentée.
 * - `full_name`  : nom affiché, optionnel (l'inscription ne demande que l'email).
 * - `email`      : identifiant de connexion (uid). Unique et limité à 254 caractères,
 *                  longueur maximale d'une adresse email selon la RFC 5321.
 * - `password`   : hash scrypt produit automatiquement par le modèle `User`
 *                  (mixin `withAuthFinder`). Jamais stocké en clair.
 * - `created_at` / `updated_at` : renseignés automatiquement par Lucid via les
 *                  décorateurs `@column.dateTime({ autoCreate, autoUpdate })`.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('full_name').nullable()
      table.string('email', 254).notNullable().unique()
      table.string('password').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
