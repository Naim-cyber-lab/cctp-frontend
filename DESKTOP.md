# Application desktop (Windows, macOS & Linux)

Ce dépôt contient le frontend, empaqueté en application native. **Le backend (api,
ai-api, PostgreSQL, Qdrant, Ollama) vit dans un autre dépôt/déploiement** — l'app
desktop est une fenêtre qui parle à ce backend hébergé, exactement comme le fait la
version web avec `localhost` en développement.

Deux implémentations existent, au choix :

| | Tauri (`src-tauri/`) | Electron (`electron/`) |
|---|---|---|
| Taille de l'installeur | ~5-10 Mo | ~80-150 Mo |
| Plateformes | Windows, macOS, **Linux** | Windows, macOS (pas de config Linux pour l'instant) |
| Compilation locale | Nécessite Rust + MSVC (Windows) | Rien à compiler, juste télécharger le binaire Electron |
| Recommandé pour | Diffusion finale (voir CI ci-dessous) | Tester en local dès maintenant |

## 1. Héberger le backend (commun aux deux)

Déployez `api` + `ai-api` + `postgres` + `qdrant` + `ollama` sur un serveur accessible
en **HTTPS** avec un vrai nom de domaine (ex. `https://api.calepin.fr`). HTTPS est
obligatoire : les navigateurs/webviews bloquent les cookies `Secure` et certaines API
sur du HTTP simple.

Configurez côté serveur (`.env` du backend) :

```bash
COOKIE_SECURE=true
EXTRA_CORS_ORIGINS=https://tauri.localhost,tauri://localhost,http://localhost:51823
```

(`https://tauri.localhost` = origine Tauri sur Windows, `tauri://localhost` = origine
Tauri sur macOS/Linux, `http://localhost:51823` = origine du serveur local qu'Electron
utilise pour servir le build — voir `electron/main.cjs`.)

## 2. Pointer le build vers ce backend

Créez `.env.production` à la racine de ce dépôt (non versionné) :

```bash
VITE_API_URL=https://api.calepin.fr/api
```

Le reste du code s'adapte automatiquement : `src/api/client.js` détecte qu'il tourne
dans Tauri ou Electron et bascule sur une authentification par jeton (au lieu du cookie
utilisé par la version web) — nécessaire car le cookie de session ne traverse pas la
frontière entre l'origine de l'app desktop et celle de l'API distante.

## 3. Compiler via GitHub Actions (recommandé — c'est ce qui est en place)

`.github/workflows/build-desktop.yml` compile l'app pour **Windows, macOS et Linux en
parallèle**, sur des machines neuves fournies par GitHub (aucun souci d'antivirus ou de
Smart App Control comme en local).

1. Poussez ce dépôt sur GitHub (voir la conversation pour les commandes exactes).
2. Onglet **Actions** → "Build desktop app (Windows / macOS / Linux)" → **Run workflow**.
   Renseignez l'URL de votre backend hébergé si vous en avez déjà un (sinon laissez la
   valeur par défaut, l'app se connectera à `localhost` — utile pour un premier test de
   la compilation elle-même).
3. Une fois terminé (~5-10 min), les 3 installateurs sont téléchargeables en bas de la
   page d'exécution, dans "Artifacts".

## 4. Tester en local avec Electron (fonctionne sans rien installer de plus)

```bash
npm install
npm run electron:dev     # ouvre l'app directement, pour tester
npm run electron:build   # produit un vrai installeur dans release/
```

⚠️ **Sur Windows, le premier `electron:build` peut échouer avec une erreur
`EPERM: operation not permitted, rename ... win-unpacked.tmp -> win-unpacked`.**
L'antivirus (ou Smart App Control) verrouille brièvement les fichiers tout juste
extraits. Attendez et relancez — si ça persiste durablement, préférez la CI (§3),
qui ne rencontre pas ce problème.

Electron ne permet pas de compiler un `.app` macOS ou un `.dmg` depuis Windows (ni
l'inverse) : pour du multi-plateforme réel en local il faudrait une machine par OS —
raison de plus de préférer la CI.

## 5. Compiler Tauri en local (si vous voulez, sur une machine sans restriction)

Prérequis (une fois par machine de build) :
- [Rust](https://www.rust-lang.org/tools/install) (`rustup`), stable, cible MSVC sur Windows.
- Windows : Visual Studio Build Tools, workload "Développement Desktop en C++".
- macOS/Linux : toolchain C standard (Xcode CLT / build-essential).

```bash
npm run tauri:build
```

Résultat dans `src-tauri/target/release/bundle/`.

## 6. Signature de code (avant diffusion publique)

Sans signature, Windows SmartScreen et macOS Gatekeeper affichent un avertissement
"éditeur inconnu" qui fait fuir les utilisateurs non techniques.

- **Windows** : certificat de signature de code (EV recommandé pour éviter l'avertissement
  SmartScreen dès le premier lancement).
- **macOS** : compte Apple Developer (99 $/an), certificat "Developer ID Application",
  puis notarisation Apple.

Voir : https://tauri.app/distribute/sign/ (Tauri) ou
https://www.electron.build/code-signing (Electron). Pas encore configuré dans le
workflow CI — à ajouter une fois les certificats en main (ils se passent en secrets
GitHub, jamais commités).

## Icône de l'application

`src-tauri/icons/` contient un jeu d'icônes **placeholder** généré automatiquement
(document bleu), réutilisé aussi par le build Electron. Remplacez par votre vraie
identité visuelle puis régénérez avec :

```bash
npx tauri icon chemin/vers/votre-icone-1024x1024.png
```
