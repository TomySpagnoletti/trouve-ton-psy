import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import * as readline from 'readline';

// --- Types ---

interface CsvCity {
    code_postal: string;
    nom_de_la_commune?: string;
    [key: string]: unknown;
}

interface GeoApiCommune {
    nom: string;
    code: string; // code INSEE
    codeDepartement: string;
    codeRegion: string;
    codesPostaux: string[];
    population: number;
    centre?: {
        coordinates: [number, number]; // [longitude, latitude]
    };
}

interface CityToAdd {
    inseeCode: string;
    name: string;
    departmentCode: string;
    regionCode: string;
    postalCodes: string[];
    population: number;
    latitude?: number;
    longitude?: number;
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
        console.error('Usage: npx tsx scripts/add_missing_cities.ts --file <CSV_FILE_PATH>');
        process.exit(1);
    }

    return { csvFilePath };
}

async function loadCitiesFromDatabase(prisma: PrismaClient): Promise<Map<string, Set<string>>> {
    console.log('📥 Loading cities from database...');
    const cities = await prisma.city.findMany({
        select: {
            insee_code: true,
            postal_codes: true,
        },
    });

    // Map: insee_code -> Set of postal codes
    const citiesMap = new Map<string, Set<string>>();
    for (const city of cities) {
        const postalCodes = new Set(city.postal_codes);
        citiesMap.set(city.insee_code, postalCodes);
    }

    console.log(`   Found ${citiesMap.size} cities in database`);
    return citiesMap;
}

async function loadPostalCodesFromCsv(csvFilePath: string): Promise<Set<string>> {
    return new Promise((resolve, reject) => {
        const csvPath = path.resolve(process.cwd(), csvFilePath);

        if (!fs.existsSync(csvPath)) {
            reject(new Error(`File not found: ${csvPath}`));
            return;
        }

        const postalCodes = new Set<string>();
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
                    postalCodes.add(postalCode);
                }
            })
            .on('end', () => {
                console.log(`   Found ${postalCodes.size} unique postal codes in CSV file`);
                resolve(postalCodes);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

function findMissingPostalCodes(csvPostalCodes: Set<string>, dbCities: Map<string, Set<string>>): Set<string> {
    const missing = new Set<string>();

    // Collect all postal codes present in DB
    const allDbPostalCodes = new Set<string>();
    for (const postalCodes of dbCities.values()) {
        for (const code of postalCodes) {
            allDbPostalCodes.add(code);
        }
    }

    // Find missing ones
    for (const code of csvPostalCodes) {
        if (!allDbPostalCodes.has(code)) {
            missing.add(code);
        }
    }

    return missing;
}

async function fetchCityByPostalCode(postalCode: string): Promise<GeoApiCommune | null> {
    try {
        const url = `https://geo.api.gouv.fr/communes?codePostal=${postalCode}&fields=nom,code,codeDepartement,codeRegion,codesPostaux,population,centre&format=json&geometry=centre`;
        const response = await fetch(url);

        if (!response.ok) {
            console.warn(`   ⚠️  API error for postal code ${postalCode}: ${response.statusText}`);
            return null;
        }

        const data: GeoApiCommune[] = await response.json();

        if (data.length === 0) {
            console.warn(`   ⚠️  No city found for postal code ${postalCode}`);
            return null;
        }

        // If multiple cities, take the one with highest population
        return data.sort((a, b) => b.population - a.population)[0];
    } catch (error) {
        console.error(`   ❌ Error fetching city for postal code ${postalCode}:`, error);
        return null;
    }
}

async function fetchMissingCities(
    missingPostalCodes: Set<string>,
    dbCities: Map<string, Set<string>>
): Promise<Map<string, CityToAdd>> {
    console.log(`\n🔍 Fetching missing cities from API (${missingPostalCodes.size} postal codes to check)...`);

    const citiesMap = new Map<string, CityToAdd>();
    let processed = 0;

    for (const postalCode of missingPostalCodes) {
        processed++;
        process.stdout.write(`\r   Progress: ${processed}/${missingPostalCodes.size}`);

        const commune = await fetchCityByPostalCode(postalCode);
        if (!commune) {
            continue;
        }

        const inseeCode = commune.code;

        // Check if this city already exists in DB
        if (dbCities.has(inseeCode)) {
            // City exists but missing this postal code - we'll need to update it
            const existingPostalCodes = dbCities.get(inseeCode)!;
            const missingCodesForThisCity = commune.codesPostaux.filter(
                cp => !existingPostalCodes.has(cp)
            );

            if (missingCodesForThisCity.length > 0) {
                console.log(`\n   ℹ️  City ${commune.nom} (${inseeCode}) exists but missing postal codes: ${missingCodesForThisCity.join(', ')}`);
            }
            continue;
        }

        // City doesn't exist in DB, we'll add it
        if (!citiesMap.has(inseeCode)) {
            citiesMap.set(inseeCode, {
                inseeCode: commune.code,
                name: commune.nom,
                departmentCode: commune.codeDepartement,
                regionCode: commune.codeRegion,
                postalCodes: commune.codesPostaux,
                population: commune.population,
                latitude: commune.centre?.coordinates[1],
                longitude: commune.centre?.coordinates[0],
            });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(''); // New line after progress
    return citiesMap;
}

async function getUserConfirmation(citiesToAdd: Map<string, CityToAdd>): Promise<boolean> {
    console.log('\n' + '='.repeat(60));
    console.log('📋 SUMMARY OF CITIES TO ADD');
    console.log('='.repeat(60));
    console.log(`\nTotal cities to add: ${citiesToAdd.size}\n`);

    // Show first 20 cities
    const cities = Array.from(citiesToAdd.values()).sort((a, b) => a.name.localeCompare(b.name));
    const displayCount = Math.min(20, cities.length);

    for (let i = 0; i < displayCount; i++) {
        const city = cities[i];
        console.log(`${i + 1}. ${city.name} (${city.inseeCode})`);
        console.log(`   Postal codes: ${city.postalCodes.join(', ')}`);
        console.log(`   Department: ${city.departmentCode}, Population: ${city.population.toLocaleString()}`);
        console.log('');
    }

    if (cities.length > displayCount) {
        console.log(`... and ${cities.length - displayCount} more cities`);
        console.log('');
    }

    console.log('='.repeat(60));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question('\n❓ Do you want to add these cities to the database? (yes/no): ', (answer) => {
            rl.close();
            const confirmed = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
            resolve(confirmed);
        });
    });
}

async function addCitiesToDatabase(prisma: PrismaClient, citiesToAdd: Map<string, CityToAdd>) {
    console.log('\n💾 Adding cities to database...');

    let added = 0;
    let failed = 0;

    for (const city of citiesToAdd.values()) {
        try {
            // We need region_name and department_name
            // Let's fetch them from the API if needed
            const regionName = await getRegionName(city.regionCode);
            const departmentName = await getDepartmentName(city.departmentCode);

            await prisma.city.create({
                data: {
                    insee_code: city.inseeCode,
                    name: city.name,
                    region_name: regionName || '',
                    department_code: city.departmentCode,
                    department_name: departmentName || '',
                    postal_codes: city.postalCodes,
                    center_latitude: city.latitude || 0,
                    center_longitude: city.longitude || 0,
                },
            });

            added++;
            process.stdout.write(`\r   Added: ${added}/${citiesToAdd.size}`);
        } catch (error) {
            failed++;
            console.error(`\n   ❌ Failed to add ${city.name}:`, error);
        }
    }

    console.log(`\n\n✅ Successfully added ${added} cities`);
    if (failed > 0) {
        console.log(`⚠️  Failed to add ${failed} cities`);
    }
}

// Cache for region and department names
const regionCache = new Map<string, string>();
const departmentCache = new Map<string, string>();

async function getRegionName(regionCode: string): Promise<string | null> {
    if (regionCache.has(regionCode)) {
        return regionCache.get(regionCode)!;
    }

    try {
        const response = await fetch(`https://geo.api.gouv.fr/regions/${regionCode}`);
        if (response.ok) {
            const data = await response.json();
            regionCache.set(regionCode, data.nom);
            return data.nom;
        }
    } catch (error) {
        console.error(`Error fetching region ${regionCode}:`, error);
    }
    return null;
}

async function getDepartmentName(departmentCode: string): Promise<string | null> {
    if (departmentCache.has(departmentCode)) {
        return departmentCache.get(departmentCode)!;
    }

    try {
        const response = await fetch(`https://geo.api.gouv.fr/departements/${departmentCode}`);
        if (response.ok) {
            const data = await response.json();
            departmentCache.set(departmentCode, data.nom);
            return data.nom;
        }
    } catch (error) {
        console.error(`Error fetching department ${departmentCode}:`, error);
    }
    return null;
}

// --- Main ---

async function main() {
    const { csvFilePath } = parseArgs();

    console.log('🚀 Starting: Add Missing Cities');
    console.log('='.repeat(60));

    const prisma = new PrismaClient();

    try {
        // STEP 1: Find what's missing
        console.log('\n📊 STEP 1: Analyzing data...\n');

        const [dbCities, csvPostalCodes] = await Promise.all([
            loadCitiesFromDatabase(prisma),
            loadPostalCodesFromCsv(csvFilePath),
        ]);

        console.log('📥 Loading postal codes from CSV...');
        const missingPostalCodes = findMissingPostalCodes(csvPostalCodes, dbCities);

        console.log(`\n✅ Found ${missingPostalCodes.size} missing postal codes`);

        if (missingPostalCodes.size === 0) {
            console.log('\n🎉 All postal codes from CSV are already in the database!');
            return;
        }

        // STEP 2: Fetch complete city data from API
        console.log('\n📊 STEP 2: Fetching city data from geo.api.gouv.fr...\n');
        const citiesToAdd = await fetchMissingCities(missingPostalCodes, dbCities);

        if (citiesToAdd.size === 0) {
            console.log('\n✅ No new cities to add (postal codes belong to existing cities)');
            return;
        }

        // STEP 3: Confirm and add to database
        console.log('\n📊 STEP 3: Confirmation and database update...\n');
        const confirmed = await getUserConfirmation(citiesToAdd);

        if (!confirmed) {
            console.log('\n❌ Operation cancelled by user');
            return;
        }

        await addCitiesToDatabase(prisma, citiesToAdd);

        console.log('\n' + '='.repeat(60));
        console.log('✅ PROCESS COMPLETED SUCCESSFULLY!');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Error:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
