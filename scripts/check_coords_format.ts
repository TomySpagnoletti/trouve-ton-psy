import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        const psy = await prisma.psychologist.findFirst({
            where: { coordinates_x: { not: null } },
            select: { address: true, coordinates_x: true, coordinates_y: true }
        });
        console.log('--- EXEMPLE PSY ---');
        console.log(psy);

        const city = await prisma.city.findFirst({
            select: { name: true, center_latitude: true, center_longitude: true }
        });
        console.log('--- EXEMPLE VILLE ---');
        console.log(city);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
