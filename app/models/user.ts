import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'

/**
 * Modèle `User`.
 *
 * Les colonnes (`id`, `email`, `password`, `createdAt`, `updatedAt`) proviennent de
 * `UserSchema`, généré depuis les migrations par `node ace migration:run`.
 *
 * Hachage automatique des mots de passe :
 * `withAuthFinder(hash)` installe un hook `beforeSave` qui hache la colonne `password`
 * avec le hasher par défaut (scrypt, voir `config/hash.ts`) dès que la valeur est
 * modifiée — à la création comme à la mise à jour. On assigne donc toujours le mot de
 * passe en clair (`user.password = '...'`), jamais un hash calculé à la main, sous peine
 * de double hachage. Le hook est idempotent : sauvegarder un utilisateur sans toucher au
 * mot de passe ne le re-hache pas.
 *
 * Le mixin fournit aussi `User.verifyCredentials(email, password)`, qui compare le mot
 * de passe fourni au hash stocké en temps constant.
 *
 * La colonne `password` est annotée `serializeAs: null` dans le schéma : elle n'est jamais
 * exposée dans les réponses JSON.
 */
export default class User extends compose(UserSchema, withAuthFinder(hash)) {
  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }

    return `${first.slice(0, 2)}`.toUpperCase()
  }
}
