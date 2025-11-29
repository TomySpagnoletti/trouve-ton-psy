import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

async function main() {
    const cityQuery = "La Rochelle";
    console.log(`Searching for city: "${cityQuery}"`);

    const city = await prisma.city.findFirst({
        where: {
            name: {
                equals: cityQuery,
                mode: 'insensitive',
            },
        },
    });

    if (city) {
        console.log(`City found: ${city.name} (INSEE: ${city.insee_code})`);
        console.log(`Coordinates: ${city.center_latitude}, ${city.center_longitude}`);

        // Check psychologists near this city
        const lat = city.center_latitude;
        const lon = city.center_longitude;
        const radiusKm = 15;

        const nearbyPsychologists: any = await prisma.$queryRaw`
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
      LIMIT 10
    `;

        console.log(`Found ${nearbyPsychologists.length} psychologists within ${radiusKm}km.`);
        nearbyPsychologists.forEach((p: any) => {
            console.log(`- ${p.firstname} ${p.lastname} (${p.distance.toFixed(2)}km) - ${p.address}`);
        });

    } else {
        console.log("City NOT found in database.");
    }

    // Check string match on address
    console.log(`\nChecking string match on address for "${cityQuery}"...`);
    const addressMatches = await prisma.psychologist.findMany({
        where: {
            visible: true,
            address: {
                contains: cityQuery,
                mode: 'insensitive',
            },
        },
        take: 10,
        select: {
            firstname: true,
            lastname: true,
            address: true,
            coordinates_x: true,
            coordinates_y: true,
        }
    });

    console.log(`Found ${addressMatches.length} psychologists with "${cityQuery}" in address.`);
    addressMatches.forEach((p: any) => {
        console.log(`- ${p.firstname} ${p.lastname} - ${p.address} (Coords: ${p.coordinates_x}, ${p.coordinates_y})`);
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
