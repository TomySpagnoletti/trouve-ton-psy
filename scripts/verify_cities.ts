import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { HttpsProxyAgent } from 'https-proxy-agent';
import proxyList from '../proxy_lists.json';
import * as readline from 'readline';

type DbCity = {
    id: number;
    insee_code: string;
    name: string;
    region_name: string;
    department_code: string;
    department_name: string;
    postal_codes: string[];
    center_latitude: number;
    center_longitude: number;
};

type GeoApiCity = {
    nom: string;
    code: string;
    codeDepartement: string;
    codeRegion: string;
    codesPostaux: string[];
    centre?: {
        coordinates: [number, number]; // [lon, lat]
    };
    departement?: {
        code: string;
        nom: string;
    };
    region?: {
        code: string;
        nom: string;
    };
};

type CityDifference = {
    field: string;
    current: unknown;
    next: unknown;
};

type CityUpdateCandidate = {
    db: DbCity;
    api: GeoApiCity;
    diffs: CityDifference[];
    updateData: CityUpdateData;
};

type CityUpdateData = {
    name?: string;
    region_name?: string;
    department_code?: string;
    department_name?: string;
    postal_codes?: string[];
    center_latitude?: number;
    center_longitude?: number;
};

type ProxyConfig = {
    entryPoint: string;
    ip: string;
    port: number;
    countryCode: string;
    asn: {
        name: string;
        number: string;
    };
};

type ProxyAgent = {
    agent: HttpsProxyAgent<string>;
    config: ProxyConfig;
};

type FailedFetch = {
    city: DbCity;
    reason: string;
};

const REQUEST_FIELDS =
    'nom,code,codeDepartement,codeRegion,codesPostaux,centre,departement,region';
const BATCH_SIZE = Math.min(20, proxyList.length);
const MIN_DELAY_MS = 1_000;
const MAX_DELAY_MS = 3_000;
const REQUEST_TIMEOUT_MS = 25_000;
const COORD_TOLERANCE = 0.000001;

if (!process.env.OXYLABS_USERNAME || !process.env.OXYLABS_PASSWORD) {
    throw new Error('OXYLABS_USERNAME and OXYLABS_PASSWORD must be set to use proxies');
}

const proxyAgents: ProxyAgent[] = proxyList.map((proxy: ProxyConfig) => {
    const proxyUrl = `https://${process.env.OXYLABS_USERNAME}:${process.env.OXYLABS_PASSWORD}@${proxy.entryPoint}:${proxy.port}`;
    return {
        agent: new HttpsProxyAgent(proxyUrl),
        config: proxy,
    };
});

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelayMs() {
    return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

async function fetchCityFromApi(inseeCode: string, proxyIndex: number): Promise<GeoApiCity | null> {
    const url = `https://geo.api.gouv.fr/communes/${inseeCode}?fields=${REQUEST_FIELDS}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const fetchOptions: RequestInit = {
            // @ts-expect-error - Node.js fetch accepts agent
            agent: proxyAgents[proxyIndex].agent,
            signal: controller.signal,
        };

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeout);

        if (!response.ok) {
            return null;
        }

        return (await response.json()) as GeoApiCity;
    } catch (error) {
        clearTimeout(timeout);
        return null;
    }
}

function arePostalCodesEqual(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((code, idx) => code === sortedB[idx]);
}

function coordinatesDiffer(current: number, next: number) {
    return Math.abs(current - next) > COORD_TOLERANCE;
}

function computeDifferences(dbCity: DbCity, apiCity: GeoApiCity): CityUpdateCandidate | null {
    const diffs: CityDifference[] = [];
    const updateData: CityUpdateData = {};

    if (dbCity.name !== apiCity.nom) {
        diffs.push({ field: 'name', current: dbCity.name, next: apiCity.nom });
        updateData.name = apiCity.nom;
    }

    if (dbCity.department_code !== apiCity.codeDepartement) {
        diffs.push({
            field: 'department_code',
            current: dbCity.department_code,
            next: apiCity.codeDepartement,
        });
        updateData.department_code = apiCity.codeDepartement;
    }

    if (apiCity.departement?.nom && dbCity.department_name !== apiCity.departement.nom) {
        diffs.push({
            field: 'department_name',
            current: dbCity.department_name,
            next: apiCity.departement.nom,
        });
        updateData.department_name = apiCity.departement.nom;
    }

    if (apiCity.region?.nom && dbCity.region_name !== apiCity.region.nom) {
        diffs.push({
            field: 'region_name',
            current: dbCity.region_name,
            next: apiCity.region.nom,
        });
        updateData.region_name = apiCity.region.nom;
    }

    if (!arePostalCodesEqual(dbCity.postal_codes, apiCity.codesPostaux)) {
        diffs.push({
            field: 'postal_codes',
            current: dbCity.postal_codes,
            next: apiCity.codesPostaux,
        });
        updateData.postal_codes = apiCity.codesPostaux;
    }

    const apiLatitude = apiCity.centre?.coordinates?.[1];
    const apiLongitude = apiCity.centre?.coordinates?.[0];

    if (typeof apiLatitude === 'number' && typeof apiLongitude === 'number') {
        if (
            coordinatesDiffer(dbCity.center_latitude, apiLatitude) ||
            coordinatesDiffer(dbCity.center_longitude, apiLongitude)
        ) {
            diffs.push({
                field: 'center',
                current: [dbCity.center_latitude, dbCity.center_longitude],
                next: [apiLatitude, apiLongitude],
            });
            updateData.center_latitude = apiLatitude;
            updateData.center_longitude = apiLongitude;
        }
    }

    if (diffs.length === 0) {
        return null;
    }

    return {
        db: dbCity,
        api: apiCity,
        diffs,
        updateData,
    };
}

async function verifyCities(dbCities: DbCity[]) {
    const candidates: CityUpdateCandidate[] = [];
    const failures: FailedFetch[] = [];
    const totalBatches = Math.ceil(dbCities.length / BATCH_SIZE);

    for (let i = 0; i < dbCities.length; i += BATCH_SIZE) {
        const batch = dbCities.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
        const delayMs = randomDelayMs();

        console.log(
            `Batch ${batchIndex}/${totalBatches}: waiting ${delayMs}ms then querying ${batch.length} cities`
        );
        await delay(delayMs);

        const results = await Promise.allSettled(
            batch.map((city, idx) => fetchCityFromApi(city.insee_code, idx % proxyAgents.length))
        );

        results.forEach((result, idx) => {
            const city = batch[idx];
            if (result.status !== 'fulfilled' || !result.value) {
                failures.push({
                    city,
                    reason: 'Failed to fetch data from geo.api.gouv.fr',
                });
                return;
            }

            const diff = computeDifferences(city, result.value);
            if (diff) {
                candidates.push(diff);
            }
        });

        process.stdout.write(
            `Processed ${Math.min(i + batch.length, dbCities.length)}/${dbCities.length} cities\r`
        );
    }

    process.stdout.write('\n');
    return { candidates, failures };
}

function printDifferences(candidates: CityUpdateCandidate[]) {
    if (candidates.length === 0) {
        console.log('No discrepancies found.');
        return;
    }

    console.log(`\nCities needing updates: ${candidates.length}\n`);
    candidates.forEach((candidate, idx) => {
        console.log(
            `${idx + 1}. ${candidate.db.name} (${candidate.db.insee_code}) - ${candidate.diffs.length} change(s)`
        );
        candidate.diffs.forEach(diff => {
            console.log(`   - ${diff.field}: ${JSON.stringify(diff.current)} -> ${JSON.stringify(diff.next)}`);
        });
        console.log('');
    });
}

function askForConfirmation(question: string) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise<boolean>(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'yes');
        });
    });
}

async function applyUpdates(prisma: PrismaClient, candidates: CityUpdateCandidate[]) {
    let updated = 0;
    for (const candidate of candidates) {
        if (Object.keys(candidate.updateData).length === 0) continue;

        await prisma.city.update({
            where: { id: candidate.db.id },
            data: candidate.updateData,
        });

        updated++;
        process.stdout.write(`Updated ${updated}/${candidates.length}\r`);
    }
    process.stdout.write('\n');
}

async function main() {
    console.log('Starting city verification against geo.api.gouv.fr');
    const prisma = new PrismaClient();

    try {
        const dbCities = await prisma.city.findMany({
            select: {
                id: true,
                insee_code: true,
                name: true,
                region_name: true,
                department_code: true,
                department_name: true,
                postal_codes: true,
                center_latitude: true,
                center_longitude: true,
            },
        });

        console.log(`Loaded ${dbCities.length} cities from database`);

        const { candidates, failures } = await verifyCities(dbCities);

        if (failures.length > 0) {
            console.log(`\nFailed to verify ${failures.length} cities (skipped updates for them):`);
            failures.slice(0, 10).forEach(failure => {
                console.log(
                    ` - ${failure.city.name} (${failure.city.insee_code}): ${failure.reason}`
                );
            });
            if (failures.length > 10) {
                console.log(` - ...and ${failures.length - 10} more`);
            }
        }

        printDifferences(candidates);

        if (candidates.length === 0) {
            console.log('No update required.');
            return;
        }

        const confirmed = await askForConfirmation('\nApply these updates to the database? (yes/no): ');
        if (!confirmed) {
            console.log('Operation cancelled.');
            return;
        }

        await applyUpdates(prisma, candidates);
        console.log('Done updating cities.');
    } catch (error) {
        console.error('Unexpected error:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
