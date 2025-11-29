import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        const total = await prisma.psychologist.count();
        const withCoords = await prisma.psychologist.count({
            where: {
                coordinates_x: { not: null },
                coordinates_y: { not: null }
            }
        });

        console.log('--- RESULTATS ---');
        console.log('Total psys:', total);
        console.log('Avec coordonnées:', withCoords);
        if (total > 0) {
            console.log('Pourcentage:', ((withCoords / total) * 100).toFixed(1) + '%');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
