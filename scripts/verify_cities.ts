import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { HttpsProxyAgent } from 'https-proxy-agent';
import proxyList from '../proxy_lists.json';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

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

type PersistedState = {
    totalCities: number;
    processedInseeCodes: string[];
    candidates: CityUpdateCandidate[];
    failures: FailedFetch[];
};

const REQUEST_FIELDS =
    'nom,code,codeDepartement,codeRegion,codesPostaux,centre,departement,region';
const BATCH_SIZE = Math.min(20, proxyList.length);
const MIN_DELAY_MS = 1_000;
const MAX_DELAY_MS = 3_000;
const REQUEST_TIMEOUT_MS = 25_000;
const COORD_TOLERANCE = 0.000001;
const REPORT_PATH = path.resolve(__dirname, '../verify_cities_report.txt');
const PROGRESS_PATH = path.resolve(__dirname, '../verify_cities_progress.json');

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
        diffs,
        updateData,
    };
}

function loadPersistedState(totalCities: number, dbCities: DbCity[]): PersistedState {
    if (!fs.existsSync(PROGRESS_PATH)) {
        return { totalCities, processedInseeCodes: [], candidates: [], failures: [] };
    }

    try {
        const raw = fs.readFileSync(PROGRESS_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        const dbByInsee = new Map(dbCities.map(city => [city.insee_code, city]));

        const candidates =
            parsed.candidates?.flatMap(candidate => {
                const dbCity = candidate?.db?.insee_code
                    ? dbByInsee.get(candidate.db.insee_code)
                    : undefined;
                if (!dbCity) return [];
                return [{ ...candidate, db: dbCity }];
            }) ?? [];

        const failures =
            parsed.failures?.flatMap(failure => {
                const dbCity = failure?.city?.insee_code
                    ? dbByInsee.get(failure.city.insee_code)
                    : undefined;
                if (!dbCity) return [];
                return [{ ...failure, city: dbCity }];
            }) ?? [];

        const processedInseeCodes = Array.from(
            new Set((parsed.processedInseeCodes ?? []).filter(code => dbByInsee.has(code)))
        );

        return { totalCities, processedInseeCodes, candidates, failures };
    } catch (error) {
        console.warn('Progress file is unreadable, starting from scratch.', error);
        return { totalCities, processedInseeCodes: [], candidates: [], failures: [] };
    }
}

function buildHistogram(candidates: CityUpdateCandidate[]) {
    const histogram: Record<number, number> = {};
    candidates.forEach(candidate => {
        const count = candidate.diffs.length;
        histogram[count] = (histogram[count] ?? 0) + 1;
    });
    return histogram;
}

function buildReport(state: PersistedState) {
    const histogram = buildHistogram(state.candidates);
    const lines: string[] = [];
    const pending = Math.max(state.totalCities - state.processedInseeCodes.length, 0);

    lines.push('City verification report');
    lines.push(`Generated at: ${new Date().toISOString()}`);
    lines.push(`Progress file: ${path.basename(PROGRESS_PATH)}`);
    lines.push('');
    lines.push(`Total cities in DB: ${state.totalCities}`);
    lines.push(`Processed so far: ${state.processedInseeCodes.length}`);
    lines.push(`Pending: ${pending}`);
    lines.push(`Cities needing updates: ${state.candidates.length}`);
    lines.push(`Failed fetches: ${state.failures.length}`);
    lines.push('');
    lines.push('Changes per city:');
    if (Object.keys(histogram).length === 0) {
        lines.push(' - none');
    } else {
        Object.keys(histogram)
            .map(key => Number(key))
            .sort((a, b) => a - b)
            .forEach(changeCount => {
                lines.push(` - ${changeCount} change(s): ${histogram[changeCount]}`);
            });
    }

    lines.push('');
    lines.push('Cities needing updates:');
    if (state.candidates.length === 0) {
        lines.push(' - none');
    } else {
        state.candidates.forEach((candidate, idx) => {
            lines.push(
                `${idx + 1}. ${candidate.db.name} (${candidate.db.insee_code}) - ${candidate.diffs.length} change(s)`
            );
            candidate.diffs.forEach(diff => {
                lines.push(
                    `   - ${diff.field}: ${JSON.stringify(diff.current)} -> ${JSON.stringify(diff.next)}`
                );
            });
            lines.push('');
        });
    }

    lines.push('Failed fetches:');
    if (state.failures.length === 0) {
        lines.push(' - none');
    } else {
        state.failures.forEach(failure => {
            lines.push(
                ` - ${failure.city.name} (${failure.city.insee_code}): ${failure.reason}`
            );
        });
    }

    return lines.join('\n');
}

function persistProgress(state: PersistedState) {
    const normalizedState: PersistedState = {
        totalCities: state.totalCities,
        processedInseeCodes: Array.from(new Set(state.processedInseeCodes)),
        candidates: state.candidates,
        failures: state.failures,
    };

    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(normalizedState, null, 2), 'utf-8');
    fs.writeFileSync(REPORT_PATH, buildReport(normalizedState), 'utf-8');
}

function upsertCandidate(candidates: CityUpdateCandidate[], candidate: CityUpdateCandidate) {
    const idx = candidates.findIndex(item => item.db.insee_code === candidate.db.insee_code);
    if (idx >= 0) {
        candidates[idx] = candidate;
    } else {
        candidates.push(candidate);
    }
}

function upsertFailure(failures: FailedFetch[], failure: FailedFetch) {
    const idx = failures.findIndex(item => item.city.insee_code === failure.city.insee_code);
    if (idx >= 0) {
        failures[idx] = failure;
    } else {
        failures.push(failure);
    }
}

async function verifyCities(dbCities: DbCity[], initialState: PersistedState) {
    const state: PersistedState = {
        totalCities: dbCities.length,
        processedInseeCodes: initialState.processedInseeCodes,
        candidates: initialState.candidates,
        failures: initialState.failures,
    };

    const processedSet = new Set(state.processedInseeCodes);
    const remainingCities = dbCities.filter(city => !processedSet.has(city.insee_code));
    const totalBatches = Math.ceil(remainingCities.length / BATCH_SIZE);

    if (remainingCities.length === 0) {
        console.log('Existing progress file already covers every city, skipping verification.');
        persistProgress(state);
        return state;
    }

    for (let i = 0; i < remainingCities.length; i += BATCH_SIZE) {
        const batch = remainingCities.slice(i, i + BATCH_SIZE);
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
            processedSet.add(city.insee_code);

            if (result.status !== 'fulfilled' || !result.value) {
                upsertFailure(state.failures, {
                    city,
                    reason: 'Failed to fetch data from geo.api.gouv.fr',
                });
                return;
            }

            const diff = computeDifferences(city, result.value);
            if (diff) {
                upsertCandidate(state.candidates, diff);
            }
        });

        state.processedInseeCodes = Array.from(processedSet);
        persistProgress(state);
        process.stdout.write(
            `Processed ${state.processedInseeCodes.length}/${state.totalCities} cities\r`
        );
    }

    process.stdout.write('\n');
    return state;
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

        const persistedState = loadPersistedState(dbCities.length, dbCities);
        const { candidates, failures, processedInseeCodes, totalCities } =
            await verifyCities(dbCities, persistedState);

        console.log(
            `Verification complete (${processedInseeCodes.length}/${totalCities} cities covered).`
        );
        persistProgress({ candidates, failures, processedInseeCodes, totalCities });

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

        console.log(`\nDetailed report: ${REPORT_PATH}`);
        console.log(`Progress file: ${PROGRESS_PATH}`);
        if (candidates.length === 0) {
            console.log('No update required.');
            return;
        }

        const confirmed = await askForConfirmation(
            `\nApply these updates to the database? (type "yes" to confirm, review ${REPORT_PATH}): `
        );
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
