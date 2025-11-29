# Trouve Ton (Soutien) Psy

Un moteur de recherche simple et efficace pour trouver un psychologue conventionné "Mon Soutien Psy".

## À propos
Ce projet vise à offrir une alternative plus performante et ergonomique à l'annuaire officiel du gouvernement. Il permet de rechercher des psychologues par ville, nom, et d'appliquer des filtres pertinents (téléconsultation, public, spécialités, etc.).

L'objectif est de simplifier l'accès aux soins en proposant une interface épurée (Noir & Blanc) et rapide.

## Stack Technique
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS
- **Database**: Supabase Postgres (via Prisma)
- **Hosting**: Vercel
- **Data Source**: API "Mon Soutien Psy"

## Fonctionnalités
- **Recherche avancée** : Par ville, nom du praticien.
- **Filtres** :
  - Public (Adultes / Enfants)
  - Téléconsultation (Visio)
- **Mise à jour automatique** : Les données sont synchronisées régulièrement via des Cron Jobs.

## Installation

1. Cloner le repo :
   ```bash
   git clone <url-du-repo>
   ```

2. Installer les dépendances :
   ```bash
   npm install
   ```

3. Configurer les variables d'environnement (dans `.env`)
   ```env
   # Connect to Supabase via connection pooling
   DATABASE_URL="postgresql://..."

   # Direct connection to the database. Used for migrations
   DIRECT_URL="postgresql://..."

   # Oxylabs ISP Proxies Authentication (Dedicated ISP Proxies)
   # Used for all 20 proxies in proxy_lists.json
   OXYLABS_USERNAME=xxx
   OXYLABS_PASSWORD=xxx

   # Parallel requests configuration
   PARALLEL_REQUESTS=20
   ```

4. Lancer le serveur de développement :
   ```bash
   npm run dev
   ```

5. Initialiser la base de données :
   ```bash
   npx prisma db push
   ```

## Scripts

Le projet contient deux scripts principaux pour peupler la base de données.

### 1. Import des Villes (`populate_cities.ts`)
Ce script permet d'importer les villes depuis un fichier JSON (contenant les données INSEE, coordonnées, etc.).

**Usage :**
```bash
npx tsx scripts/populate_cities.ts --file <chemin_vers_fichier_json>
```

### 2. Import des Psychologues (`populate_psychologists.ts`)
Ce script est un ETL (Extract, Transform, Load) qui récupère les psychologues depuis l'annuaire Ameli via des proxies, les stocke temporairement dans une base SQLite locale (`temp_psychologists.db`), puis les envoie vers la base de données principale (Postgres).

**Usage :**
```bash
# Lancer le processus complet (Extract + Buffer + Load)
npx tsx scripts/populate_psychologists.ts

# Lancer uniquement l'étape de chargement vers Postgres (si le buffer SQLite est déjà rempli)
npx tsx scripts/populate_psychologists.ts --load-only
```

**Configuration (.env) :**
- `PARALLEL_REQUESTS` : Nombre de requêtes parallèles (défaut: 20).
- `OXYLABS_USERNAME` / `OXYLABS_PASSWORD` : Identifiants pour les proxies.

Pour plus d'informations, merci de nous contacter à trouvetonpsy@brainroad.xyz.
