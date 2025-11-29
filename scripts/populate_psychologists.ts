import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { HttpsProxyAgent } from 'https-proxy-agent';
import proxyList from '../proxy_lists.json';
import Database from 'better-sqlite3';

// --- Types ---

interface Psychologist {
    id: number; // This is the Ameli ID (id_out)
    firstname: string;
    lastname: string;
    address: string;
    coordinates_x: number;
    coordinates_y: number;
    address_additional?: string;
    phone?: string;
    email?: string;
    website?: string;
    public?: string;
    teleconsultation?: boolean;
    visible?: boolean;
    languages?: string;
}

interface City {
    id: number;
    insee_code: string;
    name: string;
    center_latitude: number;
    center_longitude: number;
}

interface ProxyConfig {
    entryPoint: string;
    ip: string;
    port: number;
    countryCode: string;
    asn: {
        name: string;
        number: string;
    };
}

interface ProxyAgent {
    agent: HttpsProxyAgent<string>;
    config: ProxyConfig;
}

interface FetchResult {
    city: City;
    proxyIndex: number;
    success: boolean;
    psychologists?: Psychologist[];
    error?: string;
}

// --- Configuration ---

const PARALLEL_REQUESTS = Math.min(
    parseInt(process.env.PARALLEL_REQUESTS || '20', 10),
    proxyList.length
);

const SQLITE_DB_PATH = 'temp_psychologists.db';

// --- SQLite Setup ---

const sqlite = new Database(SQLITE_DB_PATH);
// Create table if not exists
sqlite.exec(`
    CREATE TABLE IF NOT EXISTS psychologists (
        id_out TEXT PRIMARY KEY,
        data TEXT,
        city_ids TEXT
    )
`);

// Prepared statements for performance
const stmtSelectPsy = sqlite.prepare('SELECT data, city_ids FROM psychologists WHERE id_out = ?');
const stmtInsertPsy = sqlite.prepare('INSERT INTO psychologists (id_out, data, city_ids) VALUES (?, ?, ?)');
const stmtUpdatePsy = sqlite.prepare('UPDATE psychologists SET data = ?, city_ids = ? WHERE id_out = ?');
const stmtCountPsy = sqlite.prepare('SELECT COUNT(*) as count FROM psychologists');
const stmtSelectAllPsy = sqlite.prepare('SELECT data, city_ids FROM psychologists');

// --- Proxy Setup ---

if (!process.env.OXYLABS_USERNAME || !process.env.OXYLABS_PASSWORD) {
    throw new Error('OXYLABS_USERNAME and OXYLABS_PASSWORD must be set to use proxies');
}

const proxyAgents: ProxyAgent[] = proxyList.map((proxy: ProxyConfig) => {
    const proxyUrl = `https://${process.env.OXYLABS_USERNAME}:${process.env.OXYLABS_PASSWORD}@${proxy.entryPoint}:${proxy.port}`;
    return {
        agent: new HttpsProxyAgent(proxyUrl),
        config: proxy
    };
});

console.log(`✓ Loaded ${proxyAgents.length} dedicated ISP proxies`);
console.log(`✓ SQLite Database initialized at ${SQLITE_DB_PATH}`);

// --- Helpers ---

function parsePublicField(publicField: string | undefined): string[] {
    if (!publicField) return [];
    const result: string[] = [];
    // Case insensitive matching and optional 's' at the end
    if (/adultes?/i.test(publicField)) result.push('Adultes');
    if (/adolescents?/i.test(publicField)) result.push('Adolescents');
    if (/enfants?/i.test(publicField)) result.push('Enfants');
    return result;
}

async function fetchPsychologistsForCity(
    city: City,
    proxyIndex: number
): Promise<FetchResult> {
    const url = `https://monsoutienpsy.ameli.fr/annuaire/psychologists/search?coordinates_x=${city.center_longitude}&coordinates_y=${city.center_latitude}`;
    const { agent } = proxyAgents[proxyIndex];

    try {
        const fetchOptions: RequestInit = {
            // @ts-expect-error - Node.js fetch accepts agent
            agent: agent
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        fetchOptions.signal = controller.signal;

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeout);

        if (!response.ok) {
            return {
                city,
                proxyIndex,
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`
            };
        }

        const psychologists: Psychologist[] = await response.json();

        return {
            city,
            proxyIndex,
            success: true,
            psychologists
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            city,
            proxyIndex,
            success: false,
            error: errorMessage
        };
    }
}

function saveToLocalBuffer(psychologists: Psychologist[], cityId: number) {
    const insertTransaction = sqlite.transaction((psys: Psychologist[]) => {
        for (const psy of psys) {
            const idOut = String(psy.id);
            const existing = stmtSelectPsy.get(idOut) as { data: string, city_ids: string } | undefined;

            if (existing) {
                // Deduplication: Merge city IDs and check for data updates
                const cityIds = JSON.parse(existing.city_ids) as number[];
                let hasChanged = false;

                // 1. Check City IDs
                if (!cityIds.includes(cityId)) {
                    cityIds.push(cityId);
                    hasChanged = true;
                }

                // 2. Check Data (fields like teleconsultation, visible, etc.)
                const newData = JSON.stringify(psy);
                if (existing.data !== newData) {
                    hasChanged = true;
                }

                if (hasChanged) {
                    stmtUpdatePsy.run(newData, JSON.stringify(cityIds), idOut);
                }
            } else {
                // Insert new
                stmtInsertPsy.run(
                    idOut,
                    JSON.stringify(psy),
                    JSON.stringify([cityId])
                );
            }
        }
    });

    insertTransaction(psychologists);
}

async function loadToPostgres(prisma: PrismaClient) {
    console.log('\n🔄 Starting LOAD phase: Transferring from SQLite to Postgres...');

    const totalPsys = (stmtCountPsy.get() as { count: number }).count;
    console.log(`📦 Found ${totalPsys} unique psychologists in local buffer.`);

    const allPsys = stmtSelectAllPsy.all() as { data: string, city_ids: string }[];

    // Process in batches of 1000 to avoid memory issues and huge transactions
    const BATCH_SIZE = 250;
    const CONCURRENT_BATCHES = 10; // Use 10 connections as requested

    let processed = 0;
    const chunks = [];

    for (let i = 0; i < allPsys.length; i += BATCH_SIZE) {
        chunks.push(allPsys.slice(i, i + BATCH_SIZE));
    }

    // Process chunks with limited concurrency
    for (let i = 0; i < chunks.length; i += CONCURRENT_BATCHES) {
        const batchGroup = chunks.slice(i, i + CONCURRENT_BATCHES);

        await Promise.all(batchGroup.map(async (chunk) => {
            // Transaction per chunk
            await prisma.$transaction(
                chunk.map(row => {
                    const psy = JSON.parse(row.data) as Psychologist;
                    const cityIds = JSON.parse(row.city_ids) as number[];
                    const publicArray = parsePublicField(psy.public);

                    return prisma.psychologist.upsert({
                        where: { id_out: String(psy.id) },
                        update: {
                            firstname: psy.firstname,
                            lastname: psy.lastname,
                            address: psy.address,
                            address_additional: psy.address_additional || null,
                            coordinates_x: psy.coordinates_x,
                            coordinates_y: psy.coordinates_y,
                            phone: psy.phone || null,
                            email: psy.email || null,
                            website: psy.website || null,
                            public: publicArray,
                            teleconsultation: psy.teleconsultation || false,
                            visible: psy.visible ?? true,
                            cityIds: cityIds, // New array field
                        },
                        create: {
                            id_out: String(psy.id),
                            firstname: psy.firstname,
                            lastname: psy.lastname,
                            address: psy.address,
                            address_additional: psy.address_additional || null,
                            coordinates_x: psy.coordinates_x,
                            coordinates_y: psy.coordinates_y,
                            phone: psy.phone || null,
                            email: psy.email || null,
                            website: psy.website || null,
                            public: publicArray,
                            teleconsultation: psy.teleconsultation || false,
                            visible: psy.visible ?? true,
                            cityIds: cityIds, // New array field
                        },
                    });
                })
            );
            processed += chunk.length;
            process.stdout.write(`\rSaved ${processed}/${totalPsys} psychologists to Postgres...`);
        }));
    }
    console.log('\n✅ Load phase complete!');
}

// --- Main ---

async function main() {
    const args = process.argv.slice(2);
    const loadOnly = args.includes('--load-only');

    console.log('Connecting to database...');
    const prisma = new PrismaClient();

    if (loadOnly) {
        await loadToPostgres(prisma);
        await prisma.$disconnect();
        return;
    }

    console.log(`\n🚀 Starting ETL Process`);
    console.log(`- Extract: ${PARALLEL_REQUESTS} parallel proxies`);
    console.log(`- Buffer: SQLite (${SQLITE_DB_PATH})`);
    console.log(`- Load: Batch insert to Postgres at the end`);

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalErrors = 0;

    // Proxy stats
    const proxyStats = new Map<number, { success: number; errors: number }>();
    proxyAgents.forEach((_, index) => {
        proxyStats.set(index, { success: 0, errors: 0 });
    });

    while (true) {
        // 1. EXTRACT - Fetch batch of cities
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const citiesToFetch = await prisma.city.findMany({
            take: PARALLEL_REQUESTS,
            orderBy: { last_psychologist_fetch: { sort: 'asc', nulls: 'first' } },
            where: {
                OR: [
                    { last_psychologist_fetch: null },
                    { last_psychologist_fetch: { lt: sevenDaysAgo } }
                ]
            },
            select: {
                id: true,
                insee_code: true,
                name: true,
                center_latitude: true,
                center_longitude: true,
            }
        });

        if (citiesToFetch.length === 0) {
            console.log('\n✓ All cities have been fetched!');
            break;
        }

        console.log(`\n[Batch] Fetching ${citiesToFetch.length} cities...`);

        // Random delay
        const delay = Math.floor(Math.random() * 5000) + 1000;
        await new Promise(resolve => setTimeout(resolve, delay));

        // Fetch in parallel
        const fetchPromises = citiesToFetch.map((city, index) =>
            fetchPsychologistsForCity(city, index % proxyAgents.length)
        );
        const results = await Promise.allSettled(fetchPromises);

        // 2. TRANSFORM & BUFFER
        const successfulCities: number[] = [];

        for (const result of results) {
            if (result.status === 'rejected') {
                totalErrors++;
                continue;
            }

            const fetchResult = result.value;
            const proxyConfig = proxyAgents[fetchResult.proxyIndex].config;
            const proxyLabel = `${proxyConfig.port}:${proxyConfig.asn.name}`;

            if (!fetchResult.success) {
                console.error(`✗ ${fetchResult.city.name} [Proxy ${proxyLabel}]: ${fetchResult.error}`);
                totalErrors++;
                proxyStats.get(fetchResult.proxyIndex)!.errors++;
                continue;
            }

            // Save to SQLite (Buffer)
            const psychologists = fetchResult.psychologists || [];
            if (psychologists.length > 0) {
                saveToLocalBuffer(psychologists, fetchResult.city.id);
            }

            console.log(`✓ ${fetchResult.city.name} [Proxy ${proxyLabel}]: Buffered ${psychologists.length} psys`);

            successfulCities.push(fetchResult.city.id);
            totalSuccess++;
            proxyStats.get(fetchResult.proxyIndex)!.success++;
        }

        // Update Postgres status for successful cities
        if (successfulCities.length > 0) {
            const now = new Date();
            await prisma.city.updateMany({
                where: { id: { in: successfulCities } },
                data: { last_psychologist_fetch: now }
            });
        }

        totalProcessed += citiesToFetch.length;
        const currentTotalPsys = (stmtCountPsy.get() as { count: number }).count;
        console.log(`[Progress] Processed: ${totalProcessed} | Buffered Unique Psys: ${currentTotalPsys}`);
    }

    // 3. LOAD - Final push to Postgres
    await loadToPostgres(prisma);

    // Final Stats
    console.log('\n========== PROXY STATISTICS ==========');
    proxyStats.forEach((stats, proxyIndex) => {
        const config = proxyAgents[proxyIndex].config;
        const total = stats.success + stats.errors;
        const successRate = total > 0 ? ((stats.success / total) * 100).toFixed(1) : '0.0';
        console.log(`Proxy ${config.port} (${config.asn.name}): ${stats.success} success, ${stats.errors} errors (${successRate}% success rate)`);
    });
    console.log(`Totals — success: ${totalSuccess}, errors: ${totalErrors}`);
    console.log('======================================\n');

    await prisma.$disconnect();
    sqlite.close();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
