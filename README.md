# Trouve Ton Psy

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

Pour plus d'informations, merci de nous contacter à trouvetonpsy@brainroad.xyz.
