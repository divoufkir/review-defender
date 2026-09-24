import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration Lucid ORM pour la table `users`.
 *
 * Colonnes demandées par la spécification :
 * - `id`         : clé primaire auto-incrémentée.
 * - `email`      : identifiant de connexion, unique (254 = longueur max d'une adresse RFC 5321).
 * - `password`   : empreinte scrypt produite automatiquement par le modèle `User`
 *                  (mixin `withAuthFinder`), jamais le mot de passe en clair.
 * - `created_at` : rempli automatiquement par `@column.dateTime({ autoCreate: true })`.
 * - `updated_at` : rempli automatiquement par `autoUpdate: true`, nullable car absent
 *                  tant que la ligne n'a pas encore été mise à jour.
 *
 * `full_name` est un champ de profil optionnel, sans impact sur l'authentification.
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
