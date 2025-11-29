import 'dotenv/config';
import { PrismaClient } from '../src/generated/client/client';

async function main() {
    const prisma = new PrismaClient();

    try {
        // Chercher Paris
        const paris = await prisma.city.findMany({
            where: {
                name: {
                    contains: 'Paris',
                    mode: 'insensitive',
                },
            },
            select: {
                id: true,
                insee_code: true,
                name: true,
                postal_codes: true,
                department_code: true,
            },
        });

        console.log(`\n🔍 Found ${paris.length} cities containing "Paris":\n`);

        for (const city of paris) {
            console.log(`- ${city.name} (${city.insee_code})`);
            console.log(`  Codes postaux: ${city.postal_codes.join(', ')}`);
            console.log(`  Department: ${city.department_code}\n`);
        }

        // Vérifier Paris 1er arrondissement spécifiquement
        const paris75001 = await prisma.city.findMany({
            where: {
                postal_codes: {
                    has: '75001',
                },
            },
        });

        console.log(`\n🔍 Cities with postal code 75001: ${paris75001.length}`);
        if (paris75001.length > 0) {
            console.log(paris75001);
        }

    } catch (error) {
        console.error('Error:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
