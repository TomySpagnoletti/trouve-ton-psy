import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';

// --- Types ---

interface CsvCity {
    code_postal: string;
    nom?: string;
    [key: string]: unknown;
}

// --- Helpers ---

function parseArgs() {
    const args = process.argv.slice(2);
    let csvFilePath = '';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--file') {
            csvFilePath = args[i + 1];
            i++;
        }
    }

    if (!csvFilePath) {
        console.error('Usage: npx tsx scripts/check_missing_cities.ts --file <CSV_FILE_PATH>');
        process.exit(1);
    }

    return { csvFilePath };
}

async function loadCitiesFromDatabase(prisma: PrismaClient): Promise<Set<string>> {
    console.log('Loading cities from database...');
    const cities = await prisma.city.findMany({
        select: {
            postal_codes: true,
        },
    });

    const postalCodes = new Set<string>();
    for (const city of cities) {
        if (city.postal_codes && city.postal_codes.length > 0) {
            for (const code of city.postal_codes) {
                postalCodes.add(code);
            }
        }
    }

    console.log(`Found ${postalCodes.size} unique postal codes in database`);
    return postalCodes;
}

async function loadCitiesFromCsv(csvFilePath: string): Promise<Map<string, string[]>> {
    return new Promise((resolve, reject) => {
        const csvPath = path.resolve(process.cwd(), csvFilePath);

        if (!fs.existsSync(csvPath)) {
            reject(new Error(`File not found: ${csvPath}`));
            return;
        }

        const citiesMap = new Map<string, string[]>();
        const parser = parse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
            delimiter: ',',
        });

        fs.createReadStream(csvPath)
            .pipe(parser)
            .on('data', (row: CsvCity) => {
                const postalCode = row.code_postal?.trim();
                if (postalCode) {
                    const cityNameCandidate = row.nom_de_la_commune ?? row.nom ?? row.name ?? row.ville ?? row.libelle_d_acheminement;
                    const cityName = typeof cityNameCandidate === 'string' && cityNameCandidate.trim().length > 0
                        ? cityNameCandidate.trim()
                        : postalCode;
                    if (!citiesMap.has(postalCode)) {
                        citiesMap.set(postalCode, []);
                    }
                    if (!citiesMap.get(postalCode)!.includes(cityName)) {
                        citiesMap.get(postalCode)!.push(cityName);
                    }
                }
            })
            .on('end', () => {
                console.log(`Found ${citiesMap.size} unique postal codes in CSV file`);
                resolve(citiesMap);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// --- Main ---

async function main() {
    const { csvFilePath } = parseArgs();

    console.log('Connecting to database...');
    const prisma = new PrismaClient();

    try {
        // Load data from both sources
        const [dbPostalCodes, csvCities] = await Promise.all([
            loadCitiesFromDatabase(prisma),
            loadCitiesFromCsv(csvFilePath),
        ]);

        // Find missing cities
        console.log('Comparing postal codes...');
        const missingCities: Array<{ postalCode: string; cityNames: string[] }> = [];

        for (const [postalCode, cityNames] of csvCities.entries()) {
            if (!dbPostalCodes.has(postalCode)) {
                missingCities.push({ postalCode, cityNames });
            }
        }

        // Generate output
        console.log(`Found ${missingCities.length} missing postal codes`);

        if (missingCities.length === 0) {
            console.log('✅ All cities from CSV are present in the database!');
        } else {
            // Sort by postal code
            missingCities.sort((a, b) => a.postalCode.localeCompare(b.postalCode));

            // Generate output text
            let output = `===========================================\n`;
            output += `VILLES MANQUANTES DANS LA BASE DE DONNÉES\n`;
            output += `===========================================\n\n`;
            output += `Date: ${new Date().toLocaleString('fr-FR')}\n`;
            output += `Total de codes postaux manquants: ${missingCities.length}\n\n`;
            output += `===========================================\n\n`;

            for (const { postalCode, cityNames } of missingCities) {
                output += `Code Postal: ${postalCode}\n`;
                output += `  Ville(s): ${cityNames.join(', ')}\n\n`;
            }

            // Save to file
            const outputFileName = `missing_cities_${Date.now()}.txt`;
            const outputPath = path.join(process.cwd(), outputFileName);
            fs.writeFileSync(outputPath, output, 'utf-8');

            console.log(`\n✅ Report saved to: ${outputFileName}`);
            console.log(`Full path: ${outputPath}`);
            console.log(`\n📊 Summary:`);
            console.log(`   - Postal codes in CSV: ${csvCities.size}`);
            console.log(`   - Postal codes in DB: ${dbPostalCodes.size}`);
            console.log(`   - Missing postal codes: ${missingCities.length}`);
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
