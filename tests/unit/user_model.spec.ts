import { test } from '@japa/runner'
import hash from '@adonisjs/core/services/hash'
import { DateTime } from 'luxon'
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

  test('sans nom complet, les initiales sont dérivées de l’email', ({ assert }) => {
    const user = new User()
    user.fullName = null
    user.email = 'ada@example.com'

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

    assert.instanceOf(user.createdAt, DateTime)
    assert.instanceOf(user.updatedAt, DateTime)
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
 * Le getter `initials` dérive un avatar textuel : à partir du nom complet quand
 * il est renseigné, sinon à partir de la partie locale de l'email.
 */
test.group('User model | getter initials', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('les initiales viennent du nom complet quand il est renseigné', async ({ assert }) => {
    const user = await User.create({
      email: 'ada.lovelace@example.com',
      password: 'secret-password',
      fullName: 'Ada Lovelace',
    })

    assert.equal(user.initials, 'AL')
  })

  test('sans nom complet, les initiales viennent de l’email', async ({ assert }) => {
    const user = await User.create({ email: 'grace@example.com', password: 'secret-password' })

    // `email.split('@')` renvoie deux parties : le getter prend donc l'initiale
    // de la partie locale puis celle du domaine (et non les deux premières
    // lettres de la partie locale).
    assert.equal(user.initials, 'GE')
  })

  test('un nom complet en un seul mot donne ses deux premières lettres', async ({ assert }) => {
    const user = await User.create({
      email: 'prince@example.com',
      password: 'secret-password',
      fullName: 'Prince',
    })

    assert.equal(user.initials, 'PR')
  })
})
