import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'

/**
 * Mixin d'authentification Lucid.
 *
 * `withAuthFinder(hash)` ajoute au modèle :
 * - un hook `beforeSave` qui hache automatiquement la colonne `password` avec le
 *   hasher par défaut (scrypt, cf. `config/hash.ts`) dès qu'elle est modifiée ;
 *   aucun appel manuel à `hash.make()` n'est donc nécessaire ;
 * - `findForAuth(uids, value)` pour retrouver un utilisateur à la connexion ;
 * - `verifyCredentials(uid, password)` qui compare le mot de passe en se
 *   protégeant des attaques temporelles (timing attacks).
 *
 * Les options par défaut conviennent ici : `uids: ['email']` et
 * `passwordColumnName: 'password'`.
 *
 * `UserSchema` est généré depuis la migration par `node ace migration:run` et
 * porte les colonnes `id`, `email`, `password`, `fullName`, `createdAt`,
 * `updatedAt`. Ne pas éditer `database/schema.ts` à la main.
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
