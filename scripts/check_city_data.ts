import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('Checking cities named "La Rochelle" in database...\n');

    const cities = await prisma.city.findMany({
        where: {
            name: {
                contains: 'Rochelle',
                mode: 'insensitive',
            },
        },
    });

    console.log(`Found ${cities.length} cities matching "Rochelle":\n`);

    cities.forEach((city, index) => {
        console.log(`${index + 1}. ${city.name}`);
        console.log(`   - INSEE: ${city.insee_code}`);
        console.log(`   - Department: ${city.department_name} (${city.department_code})`);
        console.log(`   - Region: ${city.region_name}`);
        console.log(`   - Postal codes: ${city.postal_codes.join(', ')}`);
        console.log(`   - Center: ${city.center_latitude}, ${city.center_longitude}`);
        console.log('');
    });

    // Check La Rochelle specifically (should be department 17)
    const laRochelleProper = cities.find(c => c.department_code === '17' && c.name.toLowerCase().includes('rochelle'));

    if (laRochelleProper) {
        console.log('✅ Found La Rochelle in Charente-Maritime (17)');
        console.log(`Expected coordinates should be around: 46.16, -1.15`);
        console.log(`Actual coordinates: ${laRochelleProper.center_latitude}, ${laRochelleProper.center_longitude}`);

        if (Math.abs(laRochelleProper.center_latitude - 46.16) > 1 ||
            Math.abs(laRochelleProper.center_longitude - (-1.15)) > 1) {
            console.log('❌ COORDINATES ARE INCORRECT!');
        } else {
            console.log('✅ Coordinates look correct');
        }
    } else {
        console.log('❌ La Rochelle (Charente-Maritime) NOT found in database!');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
