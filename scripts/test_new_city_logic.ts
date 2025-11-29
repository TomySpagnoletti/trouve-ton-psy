import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function testCitySearch(cityInput: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing search for: "${cityInput}"`);
    console.log('='.repeat(60));

    // Simulate the new logic
    const postalCodeMatch = cityInput.match(/\(([0-9]{5}(?:\.\.\.[0-9]{5})?)\)/);
    const postalCode = postalCodeMatch ? postalCodeMatch[1].split('...')[0] : null;
    const cityNameOnly = postalCode ? cityInput.replace(/\s*\([^)]*\)\s*$/, '').trim() : cityInput;

    console.log(`City name: "${cityNameOnly}"`);
    console.log(`Postal code: ${postalCode || 'None'}`);

    let cityData;

    if (postalCode) {
        // Search by postal code for exact match
        cityData = await prisma.city.findFirst({
            where: {
                name: {
                    equals: cityNameOnly,
                    mode: 'insensitive',
                },
                postal_codes: {
                    has: postalCode,
                },
            },
        });
        console.log(`\nSearching with postal code...`);
    }

    // Fallback to name search if no postal code or no match found
    if (!cityData) {
        const cities = await prisma.city.findMany({
            where: {
                name: {
                    equals: cityNameOnly,
                    mode: 'insensitive',
                },
            },
        });

        console.log(`\nFound ${cities.length} cities with name "${cityNameOnly}":`);
        cities.forEach((c, i) => {
            console.log(`  ${i + 1}. ${c.name} (${c.department_code}) - ${c.postal_codes.join(', ')}`);
        });

        // Sort by postal codes count (desc) and then by department code (asc)
        cityData = cities.sort((a, b) => {
            const postalDiff = b.postal_codes.length - a.postal_codes.length;
            if (postalDiff !== 0) return postalDiff;
            return parseInt(a.department_code) - parseInt(b.department_code);
        })[0];
    }

    if (cityData) {
        console.log(`\n✅ Selected: ${cityData.name} (${cityData.department_code})`);
        console.log(`   Coordinates: ${cityData.center_latitude}, ${cityData.center_longitude}`);
        console.log(`   Postal codes: ${cityData.postal_codes.join(', ')}`);

        // Quick psychologist count
        const lat = cityData.center_latitude;
        const lon = cityData.center_longitude;
        const radiusKm = 15;

        const count = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int as count
      FROM "Psychologist"
      WHERE visible = true
      AND coordinates_x IS NOT NULL 
      AND coordinates_y IS NOT NULL
      AND (
        6371 * acos(
          cos(radians(${lat})) * cos(radians(coordinates_y)) *
          cos(radians(coordinates_x) - radians(${lon})) +
          sin(radians(${lat})) * sin(radians(coordinates_y))
        )
      ) < ${radiusKm}
    `;

        console.log(`   Psychologists within ${radiusKm}km: ${count[0]?.count ?? 0}`);
    } else {
        console.log(`\n❌ No city found!`);
    }
}

async function main() {
    // Test different inputs
    await testCitySearch("La Rochelle (17000)");  // With postal code
    await testCitySearch("La Rochelle");           // Without postal code
    await testCitySearch("Paris (75001...75020)"); // Multiple postal codes
    await testCitySearch("Paris");                 // Just Paris
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
