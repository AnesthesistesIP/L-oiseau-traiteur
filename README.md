# L'Oiseau Traiteur — mise en ligne autonome

Ce dossier contient le code complet de l'appli, prêt à être déployé en dehors de Claude,
gratuitement, sur un vrai lien web accessible à toute l'équipe sans aucun compte Claude.

Trois services gratuits sont utilisés :
- **Firebase (Firestore)** : la base de données qui remplace le stockage de Claude.
- **GitHub** : héberge le code source.
- **Vercel** : publie le site sur un lien public et le garde à jour automatiquement.

Comptez environ 30 à 45 minutes la première fois. Une fois fait, vous n'aurez plus jamais à
recommencer ces étapes — seuls de futurs changements de code nécessiteront une republication
(automatique, en une commande).

---

## Étape 1 — Créer le projet Firebase (la base de données)

1. Allez sur **console.firebase.google.com** et connectez-vous avec un compte Google (créez-en un
   dédié à la clinique si vous préférez ne pas mélanger avec un compte personnel).
2. Cliquez sur **"Ajouter un projet"**. Donnez-lui un nom, par exemple `loiseau-traiteur`.
3. Désactivez Google Analytics si proposé (pas utile ici), puis créez le projet.
4. Une fois dans le projet, dans le menu de gauche, allez dans **Build > Firestore Database**.
5. Cliquez sur **"Créer une base de données"**.
   - Choisissez une région proche (ex. `eur3 (europe-west)`).
   - Mode de démarrage : choisissez **"Mode production"** (on posera nos propres règles à l'étape 5).
6. Toujours dans le menu de gauche, cliquez sur l'icône ⚙️ **"Paramètres du projet"**.
7. Descendez jusqu'à **"Vos applications"**, cliquez sur l'icône **`</>`** (Web) pour ajouter une
   application web.
8. Donnez-lui un surnom (ex. `web`), pas besoin de cocher "Firebase Hosting". Cliquez sur
   **"Enregistrer l'application"**.
9. Firebase affiche un bloc de code avec un objet `firebaseConfig` contenant des valeurs comme
   `apiKey`, `authDomain`, `projectId`, etc. **Gardez cette page ouverte**, vous en aurez besoin à
   l'étape 4.

---

## Étape 2 — Créer un compte GitHub (pour héberger le code)

1. Allez sur **github.com** et créez un compte gratuit si vous n'en avez pas déjà un.
2. Cliquez sur **"New"** (ou le "+" en haut à droite > "New repository") pour créer un nouveau
   dépôt.
3. Nommez-le `loiseau-traiteur`, laissez-le en **Public** ou **Private** (les deux fonctionnent
   avec Vercel), ne cochez aucune case d'initialisation (pas de README, pas de .gitignore —
   on les a déjà). Cliquez sur **"Create repository"**.
4. GitHub affiche une page avec des commandes. Gardez cette page ouverte aussi.

---

## Étape 3 — Envoyer le code sur GitHub

Sur votre ordinateur, ouvrez un terminal dans le dossier de ce projet (celui que vous venez de
télécharger) et exécutez, dans l'ordre :

```bash
git init
git add .
git commit -m "Version initiale"
git branch -M main
git remote add origin https://github.com/VOTRE-NOM-UTILISATEUR/loiseau-traiteur.git
git push -u origin main
```

Remplacez `VOTRE-NOM-UTILISATEUR` par votre nom d'utilisateur GitHub (visible dans l'URL affichée
à l'étape précédente). Git vous demandera de vous authentifier — suivez les instructions à l'écran
(GitHub peut demander un "personal access token" plutôt qu'un mot de passe classique ; GitHub vous
guide pour en créer un si besoin).

*(Si vous n'avez pas Git installé sur votre ordinateur, vous pouvez aussi utiliser le bouton
"Upload files" sur la page de votre dépôt GitHub et glisser-déposer tous les fichiers de ce
dossier — un peu plus manuel mais ça fonctionne tout aussi bien pour démarrer.)*

---

## Étape 4 — Déployer sur Vercel

1. Allez sur **vercel.com** et inscrivez-vous en cliquant sur **"Continue with GitHub"** (le plus
   simple, ça relie directement les deux comptes).
2. Une fois connecté, cliquez sur **"Add New..." > "Project"**.
3. Vercel affiche la liste de vos dépôts GitHub — cliquez sur **"Import"** à côté de
   `loiseau-traiteur`.
4. Vercel détecte automatiquement qu'il s'agit d'un projet Vite — laissez les réglages par défaut.
5. Avant de cliquer sur "Deploy", ouvrez la section **"Environment Variables"**. C'est ici qu'on
   entre les clés Firebase récupérées à l'étape 1. Ajoutez ces 6 lignes une par une (nom à gauche,
   valeur correspondante à droite, copiée depuis le `firebaseConfig` de Firebase) :

   | Nom | Valeur (depuis firebaseConfig) |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` |
   | `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
   | `VITE_FIREBASE_APP_ID` | `appId` |

6. Cliquez sur **"Deploy"**. Après une à deux minutes, Vercel affiche "Congratulations" avec un
   lien du type `loiseau-traiteur.vercel.app` — **c'est le lien définitif à partager avec toute
   l'équipe**.

---

## Étape 5 — Sécuriser la base de données Firestore

Par défaut en "Mode production", Firestore bloque tout accès — l'appli ne pourra ni lire ni écrire
tant qu'on n'aura pas posé de règles.

1. Retournez sur **console.firebase.google.com**, dans votre projet > **Firestore Database** >
   onglet **"Règles"**.
2. Remplacez le contenu par celui du fichier `firestore.rules` fourni dans ce dossier (ouvrez-le
   avec un éditeur de texte, copiez tout, collez dans la console Firebase à la place du contenu
   existant).
3. Cliquez sur **"Publier"**.

⚠️ Ces règles sont volontairement simples (pas de mot de passe, comme l'appli actuelle) — le détail
et les limites de cette approche sont expliqués en commentaire dans le fichier lui-même.

---

## Étape 6 — Tester

1. Ouvrez le lien Vercel (`https://loiseau-traiteur.vercel.app` ou similaire) sur votre téléphone.
2. Ajoutez un nom de médecin, un menu test, une commande.
3. Rechargez la page — tout doit être conservé, sans aucun bandeau d'avertissement, et sans avoir
   besoin d'être connecté à quoi que ce soit.
4. Envoyez le lien à un collègue pour vérifier qu'il voit bien les mêmes données.

---

## Pour la suite : modifier l'appli

Si vous voulez que je fasse évoluer l'appli plus tard (nouvelle fonctionnalité, correction), je
vous fournirai le fichier `App.jsx` mis à jour. Il suffira de remplacer le fichier dans le dossier
`src/`, puis :

```bash
git add .
git commit -m "Mise à jour"
git push
```

Vercel republie automatiquement en moins d'une minute à chaque `git push` — plus besoin de refaire
les étapes de configuration.

---

## Coûts

Pour l'usage d'une équipe d'une dizaine de médecins commandant un repas par jour, vous resterez
très largement dans les paliers gratuits de Firebase (Spark), GitHub et Vercel (Hobby) indéfiniment
— aucune carte bancaire n'est même demandée à l'inscription sur ces paliers.
