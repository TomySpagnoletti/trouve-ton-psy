import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('Checking postal codes coverage in City table...\n');

    // Count total cities
    const totalCities = await prisma.city.count();
    console.log(`Total cities in database: ${totalCities}`);

    // Count cities with empty postal_codes array
    const citiesWithoutPostalCodes = await prisma.city.findMany({
        where: {
            OR: [
                { postal_codes: { isEmpty: true } },
                { postal_codes: { equals: [] } },
            ]
        },
        select: {
            name: true,
            department_name: true,
            insee_code: true,
            postal_codes: true,
        }
    });

    console.log(`Cities without postal codes: ${citiesWithoutPostalCodes.length}`);

    if (citiesWithoutPostalCodes.length > 0) {
        console.log('\n❌ Cities missing postal codes:');
        citiesWithoutPostalCodes.forEach((city, i) => {
            console.log(`  ${i + 1}. ${city.name} (${city.department_name}) - INSEE: ${city.insee_code}`);
        });
    } else {
        console.log('✅ All cities have postal codes!');
    }

    // Sample some cities to verify data quality
    console.log('\n📊 Sample of cities with postal codes:');
    const sampleCities = await prisma.city.findMany({
        take: 10,
        select: {
            name: true,
            department_code: true,
            postal_codes: true,
        }
    });

    sampleCities.forEach((city, i) => {
        console.log(`  ${i + 1}. ${city.name} (${city.department_code}) - ${city.postal_codes.join(', ')}`);
    });

    // Check coverage percentage
    const coverage = ((totalCities - citiesWithoutPostalCodes.length) / totalCities * 100).toFixed(2);
    console.log(`\n📈 Postal code coverage: ${coverage}%`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
