import { test } from '@japa/runner'
import hash from '@adonisjs/core/services/hash'
import { DateTime } from 'luxon'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'

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

  test('merge() déclenche aussi le hachage du mot de passe', async ({ assert }) => {
    const user = await User.create({ email: 'edsger@example.com', password: 'ancien-password' })

    // Le hook `beforeSave` est posé sur la sauvegarde, pas sur l'affectation :
    // passer par `merge()` doit donc hacher tout autant que l'assignation directe.
    user.merge({ password: 'nouveau-password' })
    await user.save()

    assert.isTrue(hash.isValidHash(user.password))
    assert.isTrue(await hash.verify(user.password, 'nouveau-password'))
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

  test('deux utilisateurs avec le même mot de passe ont des hash différents', async ({
    assert,
  }) => {
    const first = await User.create({ email: 'salt-a@example.com', password: 'secret-password' })
    const second = await User.create({ email: 'salt-b@example.com', password: 'secret-password' })

    // Le hasher utilise un sel aléatoire par enregistrement : un même mot de
    // passe ne doit jamais produire deux fois le même hash en base.
    assert.notEqual(first.password, second.password)
    assert.isTrue(await hash.verify(first.password, 'secret-password'))
    assert.isTrue(await hash.verify(second.password, 'secret-password'))
  })

  test('verifyCredentials rejette un email inconnu', async ({ assert }) => {
    await assert.rejects(() => User.verifyCredentials('inconnu@example.com', 'secret-password'))
  })

  test('email inconnu et mauvais mot de passe échouent de la même façon', async ({ assert }) => {
    await User.create({ email: 'enumeration@example.com', password: 'secret-password' })

    // Garde anti-énumération : si l'erreur différait selon que l'email existe ou
    // non, un attaquant pourrait découvrir les comptes enregistrés en comparant
    // simplement les réponses. Les deux échecs doivent rester indiscernables.
    const wrongPassword = await User.verifyCredentials(
      'enumeration@example.com',
      'mauvais-password'
    ).catch((error) => error)
    const unknownEmail = await User.verifyCredentials(
      'inconnu@example.com',
      'secret-password'
    ).catch((error) => error)

    assert.equal(wrongPassword.code, 'E_INVALID_CREDENTIALS')
    assert.equal(unknownEmail.code, wrongPassword.code)
    assert.equal(unknownEmail.message, wrongPassword.message)
  })

  test('un mot de passe unicode et long est haché puis vérifié', async ({ assert }) => {
    // scrypt travaille sur des octets : un mot de passe multi-octets (accents,
    // emoji) ne doit ni tronquer ni casser la vérification.
    const password = `Mot-de-passe-très-lông-🔐-${'x'.repeat(200)}`
    const user = await User.create({ email: 'unicode@example.com', password })

    assert.isTrue(hash.isValidHash(user.password))
    assert.isTrue(await hash.verify(user.password, password))
    assert.isFalse(await hash.verify(user.password, password.slice(0, -1)))
  })

  test('le hash fraîchement créé n’a pas besoin d’être re-haché', async ({ assert }) => {
    const user = await User.create({ email: 'rehash@example.com', password: 'secret-password' })

    // `needsReHash` compare les paramètres stockés dans le hash à ceux de
    // `config/hash.ts` : à la création, ils coïncident forcément.
    assert.isFalse(hash.needsReHash(user.password))
  })

  test('la ligne en base ne contient jamais le mot de passe en clair', async ({ assert }) => {
    await User.create({ email: 'raw@example.com', password: 'secret-password' })

    // Les autres assertions lisent `user.password`, c'est-à-dire l'instance
    // renvoyée par Lucid. On relit ici la colonne en SQL brut pour prouver que
    // c'est bien le hash, et non le clair, qui a été écrit sur le disque.
    const row = await db.from('users').where('email', 'raw@example.com').firstOrFail()

    assert.notEqual(row.password, 'secret-password')
    assert.isTrue(hash.isValidHash(row.password))
    assert.isTrue(await hash.verify(row.password, 'secret-password'))
  })

  test('le hash produit utilise le driver scrypt configuré', async ({ assert }) => {
    const user = await User.create({ email: 'driver@example.com', password: 'secret-password' })

    // `config/hash.ts` déclare scrypt comme hasher par défaut. Le préfixe PHC du
    // hash le prouve : si le driver par défaut changeait, ce test le signalerait.
    assert.match(user.password, /^\$scrypt\$/)
  })

  test('createMany hache le mot de passe de chaque utilisateur', async ({ assert }) => {
    // `createMany` insère en lot : on vérifie que le hook `beforeSave` du mixin
    // s'applique bien à chaque ligne, et pas seulement au premier `create`.
    const users = await User.createMany([
      { email: 'lot-1@example.com', password: 'password-un' },
      { email: 'lot-2@example.com', password: 'password-deux' },
    ])

    assert.lengthOf(users, 2)
    assert.isTrue(await hash.verify(users[0].password, 'password-un'))
    assert.isTrue(await hash.verify(users[1].password, 'password-deux'))
    assert.notEqual(users[0].password, users[1].password)
  })

  test('le hash rechargé depuis la base reste vérifiable', async ({ assert }) => {
    const created = await User.create({
      email: 'persist@example.com',
      password: 'secret-password',
    })

    const reloaded = await User.findOrFail(created.id)
    assert.isTrue(await hash.verify(reloaded.password, 'secret-password'))
  })
})

/**
 * Couvre le getter `initials`, seul comportement métier ajouté au modèle `User`
 * en plus du mixin `withAuthFinder`. Il n'accède à aucune table : les instances
 * sont construites en mémoire, sans transaction ni insertion.
 */
test.group('User model | getter initials', () => {
  test('un nom complet donne l’initiale du prénom et celle du nom', ({ assert }) => {
    const user = new User()
    user.fullName = 'Ada Lovelace'

    assert.equal(user.initials, 'AL')
  })

  test('un nom en un seul mot donne ses deux premières lettres', ({ assert }) => {
    const user = new User()
    user.fullName = 'Ada'

    assert.equal(user.initials, 'AD')
  })

  test('un nom composé de trois mots ne retient que les deux premiers', ({ assert }) => {
    const user = new User()
    user.fullName = 'Ada Byron Lovelace'

    // La déstructuration `[first, last]` ignore les mots suivants : les
    // initiales restent celles du premier et du deuxième mot.
    assert.equal(user.initials, 'AB')
  })

  test('un nom complet vide retombe sur l’email', ({ assert }) => {
    const user = new User()
    user.fullName = ''
    user.email = 'ada@example.com'

    // La chaîne vide est falsy : le getter bascule sur l'email au même titre
    // qu'un `fullName` à `null`.
    assert.equal(user.initials, 'AE')
  })

  test('un email dont la partie locale tient en une lettre reste géré', ({ assert }) => {
    const user = new User()
    user.fullName = null
    user.email = 'a@example.com'

    // `charAt(0)` sur une partie locale d'une seule lettre ne lève pas : on
    // obtient toujours deux caractères (partie locale + domaine).
    assert.equal(user.initials, 'AE')
  })

  test('sans nom complet, les initiales sont dérivées de l’email', ({ assert }) => {
    const user = new User()
    user.fullName = null
    user.email = 'ada@example.com'

    // `email.split('@')` renvoie deux parties : le getter prend donc l'initiale
    // de la partie locale puis celle du domaine (et non les deux premières
    // lettres de la partie locale).
    assert.equal(user.initials, 'AE')
  })
})

/**
 * Couvre les colonnes `created_at` / `updated_at` renseignées automatiquement par
 * les décorateurs `@column.dateTime({ autoCreate, autoUpdate })`, ainsi que
 * l'index unique sur `email` vu depuis l'application (la contrainte SQL
 * elle-même est vérifiée par `users_migration.spec.ts`).
 */
test.group('User model | timestamps et unicité de l’email', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('created_at et updated_at sont renseignés à la création', async ({ assert }) => {
    const user = await User.create({ email: 'tim@example.com', password: 'secret-password' })

    // `DateTime` a un constructeur privé : `assert.instanceOf` ne l'accepte pas
    // côté types, on passe donc par le garde fourni par Luxon.
    assert.isTrue(DateTime.isDateTime(user.createdAt))
    assert.isTrue(DateTime.isDateTime(user.updatedAt))
    assert.isTrue(user.createdAt.isValid)
  })

  test('updated_at avance lors d’une mise à jour, created_at reste figé', async ({ assert }) => {
    const user = await User.create({ email: 'radia@example.com', password: 'secret-password' })
    const createdAt = user.createdAt
    const previousUpdatedAt = user.updatedAt!

    // Lucid horodate à la milliseconde : sans attente, les deux dates seraient
    // identiques et l'assertion ne prouverait rien.
    await new Promise((resolve) => setTimeout(resolve, 10))

    user.fullName = 'Radia P'
    await user.save()

    assert.isTrue(user.updatedAt! > previousUpdatedAt)
    assert.equal(user.createdAt.toMillis(), createdAt.toMillis())
  })

  test('un email déjà pris est rejeté par la base', async ({ assert }) => {
    await User.create({ email: 'doublon@example.com', password: 'secret-password' })

    await assert.rejects(() =>
      User.create({ email: 'doublon@example.com', password: 'autre-password' })
    )
  })
})

/**
 * Cas limites du couple email / mot de passe : ces scénarios complètent les
 * groupes ci-dessus en vérifiant que l'ancien mot de passe devient inutilisable
 * après un changement et qu'un email à la longueur maximale reste exploitable
 * comme uid de connexion.
 */
test.group('User model | cas limites des identifiants', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('après un changement, l’ancien mot de passe est refusé', async ({ assert }) => {
    const user = await User.create({
      email: 'rotation@example.com',
      password: 'ancien-password',
    })

    user.password = 'nouveau-password'
    await user.save()

    await assert.rejects(() => User.verifyCredentials('rotation@example.com', 'ancien-password'))

    const verified = await User.verifyCredentials('rotation@example.com', 'nouveau-password')
    assert.equal(verified.id, user.id)
  })

  test('la vérification du mot de passe est sensible à la casse', async ({ assert }) => {
    await User.create({ email: 'casse@example.com', password: 'Secret-Password' })

    await assert.rejects(() => User.verifyCredentials('casse@example.com', 'secret-password'))
  })

  test('un email de 254 caractères reste un uid valide', async ({ assert }) => {
    const domain = '@example.com'
    const email = 'a'.repeat(254 - domain.length) + domain
    assert.lengthOf(email, 254)

    await User.create({ email, password: 'secret-password' })

    const verified = await User.verifyCredentials(email, 'secret-password')
    assert.equal(verified.email, email)
  })
})
