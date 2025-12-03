import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';

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

type InseeRow = {
    COM: string; // code INSEE
    TYPECOM: string;
};

type ApiCity = {
    code: string;
    nom: string;
    codesPostaux: string[];
    centre?: {
        coordinates?: [number, number]; // [lon, lat]
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

type ParsedArgs = {
    filePath: string;
};

const REQUEST_FIELDS = 'code,nom,departement,region,codesPostaux,centre';
const MAX_BATCH_SIZE = 20;
const MIN_DELAY_MS = 0;
const MAX_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 25_000;
const REPORT_PREFIX = '[populate_cities]';

const proxyList: ProxyConfig[] = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../proxy_lists.json'), 'utf-8')
);

if (!process.env.OXYLABS_USERNAME || !process.env.OXYLABS_PASSWORD) {
    throw new Error('OXYLABS_USERNAME and OXYLABS_PASSWORD must be set to use proxies');
}

const proxyAgents: ProxyAgent[] = proxyList.slice(0, MAX_BATCH_SIZE).map((proxy: ProxyConfig) => {
    const proxyUrl = `https://${process.env.OXYLABS_USERNAME}:${process.env.OXYLABS_PASSWORD}@${proxy.entryPoint}:${proxy.port}`;
    return {
        agent: new HttpsProxyAgent(proxyUrl),
        config: proxy,
    };
});

function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);
    const fileFlagIndex = args.indexOf('--file');
    if (fileFlagIndex === -1 || !args[fileFlagIndex + 1]) {
        console.error('Usage: npx tsx scripts/populate_cities.ts --file <INSEE_CSV_PATH>');
        process.exit(1);
    }

    return { filePath: path.resolve(process.cwd(), args[fileFlagIndex + 1]) };
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelayMs() {
    return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

async function fetchCity(codeInsee: string, proxyIndex: number): Promise<ApiCity | null> {
    const url = `https://geo.api.gouv.fr/communes/${codeInsee}?fields=${REQUEST_FIELDS}&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            // @ts-expect-error Node fetch supports agent
            agent: proxyAgents[proxyIndex].agent,
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) return null;
        return (await response.json()) as ApiCity;
    } catch (error) {
        clearTimeout(timeout);
        return null;
    }
}

async function fetchBatch(codes: string[]): Promise<(ApiCity | null)[]> {
    return Promise.all(
        codes.map(async (code, idx) => {
            const proxyIndex = idx % proxyAgents.length;
            const wait = randomDelayMs();
            await delay(wait);
            return fetchCity(code, proxyIndex);
        })
    );
}

async function loadCodesFromCsv(filePath: string): Promise<string[]> {
    if (!fs.existsSync(filePath)) {
        console.error(`${REPORT_PREFIX} File not found: ${filePath}`);
        process.exit(1);
    }

    const codes: string[] = [];
    const allowedTypes = new Set(['COM', 'ARM']);
    const unknownTypes = new Set<string>();
    const parser = fs
        .createReadStream(filePath)
        .pipe(
            parse({
                columns: true,
                skip_empty_lines: true,
                trim: true,
            })
        )
        .on('data', (row: InseeRow) => {
            // Keep only allowed commune entries; safeguard TYPECOM = COM/COMD/COMA/ARM
            if (!row.COM) return;
            if (row.TYPECOM && !allowedTypes.has(row.TYPECOM)) {
                unknownTypes.add(row.TYPECOM);
                return;
            }
            codes.push(row.COM.trim());
        });

    await new Promise<void>((resolve, reject) => {
        parser.on('end', () => resolve());
        parser.on('error', err => reject(err));
    });

    if (unknownTypes.size > 0) {
        console.warn(
            `${REPORT_PREFIX} Ignored ${unknownTypes.size} unknown TYPECOM values: ${[
                ...unknownTypes,
            ]
                .slice(0, 10)
                .join(', ')}`
        );
    }

    return codes;
}

async function insertCities(prisma: PrismaClient, apiCities: ApiCity[]) {
    if (apiCities.length === 0) return 0;

    const data = apiCities
        .map(city => {
            const latitude = city.centre?.coordinates?.[1];
            const longitude = city.centre?.coordinates?.[0];
            if (
                typeof latitude !== 'number' ||
                typeof longitude !== 'number' ||
                !city.codesPostaux ||
                city.codesPostaux.length === 0
            ) {
                return null;
            }
            return {
                insee_code: city.code,
                name: city.nom,
                region_name: city.region?.nom ?? '',
                department_code: city.departement?.code ?? '',
                department_name: city.departement?.nom ?? '',
                postal_codes: city.codesPostaux,
                center_latitude: latitude,
                center_longitude: longitude,
            };
        })
        .filter(Boolean) as Array<{
        insee_code: string;
        name: string;
        region_name: string;
        department_code: string;
        department_name: string;
        postal_codes: string[];
        center_latitude: number;
        center_longitude: number;
    }>;

    if (data.length === 0) return 0;

    const result = await prisma.city.createMany({
        data,
        skipDuplicates: true,
    });

    return result.count;
}

async function main() {
    const { filePath } = parseArgs();
    const prisma = new PrismaClient();

    console.log(`${REPORT_PREFIX} Loading INSEE CSV...`);
    const codes = await loadCodesFromCsv(filePath);
    console.log(`${REPORT_PREFIX} Found ${codes.length} codes in CSV`);

    let fetchedSuccess = 0;
    let insertedCount = 0;
    let totalPostalCodes = 0;
    const failures: string[] = [];

    try {
        for (let i = 0; i < codes.length; i += MAX_BATCH_SIZE) {
            const batchCodes = codes.slice(i, i + MAX_BATCH_SIZE);
            const batchIndex = Math.floor(i / MAX_BATCH_SIZE) + 1;
            process.stdout.write(
                `${REPORT_PREFIX} Batch ${batchIndex} (${batchCodes.length} codes)...\r`
            );

            const results = await fetchBatch(batchCodes);
            const successes: ApiCity[] = [];

            results.forEach((city, idx) => {
                const code = batchCodes[idx];
                if (!city) {
                    failures.push(code);
                    return;
                }
                if (!city.codesPostaux || city.codesPostaux.length === 0) {
                    failures.push(code);
                    return;
                }
                if (!city.centre?.coordinates || city.centre.coordinates.length < 2) {
                    failures.push(code);
                    return;
                }
                successes.push(city);
                totalPostalCodes += city.codesPostaux.length;
            });

            fetchedSuccess += successes.length;

            if (successes.length > 0) {
                const inserted = await insertCities(prisma, successes);
                insertedCount += inserted;
            }
        }
    } finally {
        await prisma.$disconnect();
    }

    process.stdout.write('\n');
    console.log(`${REPORT_PREFIX} Import complete.`);
    console.log(`${REPORT_PREFIX} CSV cities: ${codes.length}`);
    console.log(`${REPORT_PREFIX} Fetched from API (success): ${fetchedSuccess}`);
    console.log(`${REPORT_PREFIX} Inserted into DB: ${insertedCount}`);
    console.log(`${REPORT_PREFIX} Postal codes fetched: ${totalPostalCodes}`);
    if (failures.length > 0) {
        console.log(
            `${REPORT_PREFIX} Failures (${failures.length}) e.g.: ${failures.slice(0, 10).join(', ')}`
        );
    }
}

main().catch(error => {
    console.error(`${REPORT_PREFIX} Fatal error`, error);
    process.exit(1);
});
