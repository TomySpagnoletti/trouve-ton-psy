import 'dotenv/config';
import { PrismaClient } from '../src/generated/client/client';

/**
 * Script pour migrer postal_code (String) vers postal_codes (String[])
 * Ce script doit être exécuté AVANT de changer le schéma Prisma
 */

async function main() {
    console.log('🚀 Starting migration: postal_code -> postal_codes');

    const prisma = new PrismaClient();

    try {
        // On va faire une migration SQL directe
        console.log('📝 Step 1: Adding new column postal_codes...');
        await prisma.$executeRaw`
            ALTER TABLE "City" 
            ADD COLUMN IF NOT EXISTS "postal_codes" TEXT[] DEFAULT ARRAY[]::TEXT[];
        `;

        console.log('📝 Step 2: Copying data from postal_code to postal_codes...');
        await prisma.$executeRaw`
            UPDATE "City" 
            SET "postal_codes" = ARRAY["postal_code"]
            WHERE "postal_code" IS NOT NULL 
            AND "postal_code" != ''
            AND (postal_codes IS NULL OR array_length(postal_codes, 1) IS NULL);
        `;

        console.log('📝 Step 3: Verifying migration...');
        const totalCities = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*) as count FROM "City"
        `;

        const citiesWithPostalCodes = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*) as count FROM "City" 
            WHERE array_length(postal_codes, 1) > 0
        `;

        console.log(`   Total cities: ${totalCities[0].count}`);
        console.log(`   Cities with postal_codes: ${citiesWithPostalCodes[0].count}`);

        console.log('📝 Step 4: Dropping old column postal_code...');
        await prisma.$executeRaw`
            ALTER TABLE "City" 
            DROP COLUMN IF EXISTS "postal_code";
        `;

        console.log('✅ Migration completed successfully!');
        console.log('\nNext steps:');
        console.log('1. The schema has been updated automatically');
        console.log('2. Run: npx prisma generate');
        console.log('3. Restart your dev server');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
