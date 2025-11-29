import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    const cityQuery = "La Rochelle";
    console.log(`Testing city search for: "${cityQuery}"\n`);

    // Simulate the new logic
    const cities = await prisma.city.findMany({
        where: {
            name: {
                equals: cityQuery,
                mode: 'insensitive',
            },
        },
    });

    console.log(`Found ${cities.length} cities named "${cityQuery}":\n`);
    cities.forEach((c, i) => {
        console.log(`${i + 1}. ${c.name} (${c.department_code}) - ${c.postal_codes.length} postal codes`);
    });

    // Sort by postal codes count (descending)
    const cityData = cities.sort((a, b) => b.postal_codes.length - a.postal_codes.length)[0];

    console.log(`\n✅ Selected city: ${cityData.name} (${cityData.department_code})`);
    console.log(`   - Coordinates: ${cityData.center_latitude}, ${cityData.center_longitude}`);
    console.log(`   - Postal codes: ${cityData.postal_codes.join(', ')}`);

    // Now search for psychologists
    const lat = cityData.center_latitude;
    const lon = cityData.center_longitude;
    const radiusKm = 15;

    const nearbyPsychologists = await prisma.$queryRaw<Array<{
        id_in: number;
        firstname: string;
        lastname: string;
        address: string;
        coordinates_x: number | null;
        coordinates_y: number | null;
        distance: number;
    }>>`
    SELECT id_in, firstname, lastname, address, coordinates_x, coordinates_y,
    (
      6371 * acos(
        cos(radians(${lat})) * cos(radians(coordinates_y)) *
        cos(radians(coordinates_x) - radians(${lon})) +
        sin(radians(${lat})) * sin(radians(coordinates_y))
      )
    ) AS distance
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
    ORDER BY distance ASC
    LIMIT 20
  `;

    console.log(`\n🔍 Found ${nearbyPsychologists.length} psychologists within ${radiusKm}km:\n`);
    nearbyPsychologists.forEach((p, i: number) => {
        console.log(`${i + 1}. ${p.firstname} ${p.lastname} (${p.distance.toFixed(2)}km)`);
        console.log(`   ${p.address}`);
    });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
