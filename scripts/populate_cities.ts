import 'dotenv/config';
import { PrismaClient } from '../src/generated/client/client';
import * as fs from 'fs';
import * as path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamArray } from 'stream-json/streamers/StreamArray';

// --- Types ---

interface GeoCity {
    code_insee: string;
    nom_standard: string;
    reg_nom: string;
    dep_code: string;
    dep_nom: string;
    code_postal: string;
    latitude_centre: number;
    longitude_centre: number;
    // We ignore other fields
}

// --- Helpers ---

function parseArgs() {
    const args = process.argv.slice(2);
    let jsonFilePath = '';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--file') {
            jsonFilePath = args[i + 1];
            i++;
        }
    }

    if (!jsonFilePath) {
        console.error('Usage: npx tsx scripts/populate_cities.ts --file <JSON_FILE_PATH>');
        process.exit(1);
    }

    return { jsonFilePath };
}

async function upsertCity(prisma: PrismaClient, city: GeoCity) {
    await prisma.city.upsert({
        where: { insee_code: city.code_insee },
        update: {
            name: city.nom_standard,
            region_name: city.reg_nom,
            department_code: city.dep_code,
            department_name: city.dep_nom,
            postal_code: city.code_postal,
            center_latitude: city.latitude_centre,
            center_longitude: city.longitude_centre,
        },
        create: {
            insee_code: city.code_insee,
            name: city.nom_standard,
            region_name: city.reg_nom,
            department_code: city.dep_code,
            department_name: city.dep_nom,
            postal_code: city.code_postal,
            center_latitude: city.latitude_centre,
            center_longitude: city.longitude_centre,
        },
    });
}

// --- Main ---

async function main() {
    const { jsonFilePath } = parseArgs();

    console.log('Connecting to database...');
    const prisma = new PrismaClient();

    // Populate Cities
    console.log('Starting City Population...');
    const jsonPath = path.resolve(process.cwd(), jsonFilePath);

    if (!fs.existsSync(jsonPath)) {
        console.error(`File not found: ${jsonPath}`);
        process.exit(1);
    }

    const pipeline = chain([
        fs.createReadStream(jsonPath),
        parser(),
        pick({ filter: 'data' }),
        streamArray(),
    ]);

    let counter = 0;

    // Use for-await-of to process cities sequentially
    for await (const data of pipeline) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cityData = (data as any).value;

        // Validate required fields
        if (!cityData.code_insee || !cityData.latitude_centre || !cityData.longitude_centre) {
            continue; // Skip invalid entries
        }

        const geoCity: GeoCity = {
            code_insee: cityData.code_insee,
            nom_standard: cityData.nom_standard || '',
            reg_nom: cityData.reg_nom || '',
            dep_code: cityData.dep_code || '',
            dep_nom: cityData.dep_nom || '',
            code_postal: cityData.code_postal || '',
            latitude_centre: cityData.latitude_centre,
            longitude_centre: cityData.longitude_centre,
        };

        try {
            await upsertCity(prisma, geoCity);
            counter++;
            if (counter % 100 === 0) {
                process.stdout.write(`\rProcessed ${counter} cities...`);
            }
        } catch (error) {
            console.error(`\nError processing city ${geoCity.code_insee}:`, error);
        }
    }

    console.log(`\nCity Population Complete. Total: ${counter}`);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
