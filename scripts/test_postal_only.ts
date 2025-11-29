import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

async function testSearch(cityInput: string) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Testing: "${cityInput}"`);
    console.log('='.repeat(70));

    // Simulate the new logic
    const postalCodeMatch = cityInput.match(/\(([0-9]{5}(?:\.\.\.[0-9]{5})?)\)/);
    const postalCode = postalCodeMatch ? postalCodeMatch[1].split('...')[0] : null;
    const cityNameOnly = postalCode ? cityInput.replace(/\s*\([^)]*\)\s*$/, '').trim() : cityInput;

    console.log(`City name extracted: "${cityNameOnly}"`);
    console.log(`Postal code extracted: ${postalCode || 'None'}`);

    let cityData;

    if (postalCode) {
        // Search by postal code ONLY
        cityData = await prisma.city.findFirst({
            where: {
                postal_codes: {
                    has: postalCode,
                },
            },
        });
    }

    if (cityData && cityData.center_latitude && cityData.center_longitude) {
        console.log(`\n✅ GPS Search will be performed`);
        console.log(`   Found city: ${cityData.name} (${cityData.department_code})`);
        console.log(`   Coordinates: ${cityData.center_latitude}, ${cityData.center_longitude}`);

        const lat = cityData.center_latitude;
        const lon = cityData.center_longitude;
        const radiusKm = 15;

        const count: any = await prisma.$queryRaw`
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

        console.log(`   → ${count[0].count} psychologists within ${radiusKm}km`);
    } else {
        console.log(`\n⚠️  No GPS search (no postal code or city not found)`);
        console.log(`   Will fallback to address-based search with: "${cityNameOnly}"`);

        // Simulate the fallback
        const fallbackCount = await prisma.psychologist.count({
            where: {
                visible: true,
                address: {
                    contains: cityNameOnly,
                    mode: 'insensitive',
                },
            },
        });

        console.log(`   → ${fallbackCount} psychologists with "${cityNameOnly}" in address`);
    }
}

async function main() {
    console.log('🧪 TESTING NEW POSTAL CODE-BASED SEARCH');
    console.log('=========================================\n');

    await testSearch("La Rochelle (17000)");      // ✅ Should use GPS
    await testSearch("La Rochelle");               // ⚠️  Should fallback to address
    await testSearch("Paris (75001...75020)");     // ✅ Should use GPS  
    await testSearch("Marseille (13001...13016)"); // ✅ Should use GPS
    await testSearch("Lyon");                      // ⚠️  Should fallback to address

    console.log(`\n${'='.repeat(70)}`);
    console.log('SUMMARY:');
    console.log('- With postal code → GPS-based search (precise, 15km radius)');
    console.log('- Without postal code → Address-based fallback (less precise)');
    console.log('- City name is kept in both cases for the address fallback');
    console.log('='.repeat(70));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
