import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';

type InseeRow = {
    COM?: string;
    TYPECOM?: string;
    LIBELLE?: string;
    NCCENR?: string;
    NCC?: string;
    [key: string]: unknown;
};

type CsvCommune = {
    code: string;
    type: string;
    name: string;
};

type CsvLoadResult = {
    communes: Map<string, CsvCommune>;
    stats: {
        totalRows: number;
        kept: number;
        ignoredTypes: Map<string, number>;
        missingCode: number;
        duplicates: number;
    };
};

const REPORT_PREFIX = '[check_missing_insee_codes]';
const ALLOWED_TYPES = new Set(['COM', 'ARM']);

function parseArgs(): { filePath: string } {
    const args = process.argv.slice(2);
    const fileFlagIndex = args.indexOf('--file');

    if (fileFlagIndex === -1 || !args[fileFlagIndex + 1]) {
        console.error('Usage: npx tsx scripts/check_missing_insee_codes.ts --file <INSEE_CSV_PATH>');
        process.exit(1);
    }

    return { filePath: path.resolve(process.cwd(), args[fileFlagIndex + 1]) };
}

async function loadCsv(filePath: string): Promise<CsvLoadResult> {
    if (!fs.existsSync(filePath)) {
        console.error(`${REPORT_PREFIX} File not found: ${filePath}`);
        process.exit(1);
    }

    const communes = new Map<string, CsvCommune>();
    const ignoredTypes = new Map<string, number>();
    let totalRows = 0;
    let missingCode = 0;
    let duplicates = 0;

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
            totalRows += 1;
            const code = row.COM?.trim();
            const type = row.TYPECOM?.trim();

            if (!code) {
                missingCode += 1;
                return;
            }

            if (type && !ALLOWED_TYPES.has(type)) {
                ignoredTypes.set(type, (ignoredTypes.get(type) ?? 0) + 1);
                return;
            }

            if (communes.has(code)) {
                duplicates += 1;
                return;
            }

            const nameCandidate = [row.LIBELLE, row.NCCENR, row.NCC]
                .find(value => typeof value === 'string' && value.trim().length > 0) as string | undefined;

            communes.set(code, {
                code,
                type: type ?? 'UNKNOWN',
                name: nameCandidate ? nameCandidate.trim() : '',
            });
        });

    await new Promise<void>((resolve, reject) => {
        parser.on('end', () => resolve());
        parser.on('error', err => reject(err));
    });

    return {
        communes,
        stats: {
            totalRows,
            kept: communes.size,
            ignoredTypes,
            missingCode,
            duplicates,
        },
    };
}

async function loadDbCodes(prisma: PrismaClient): Promise<Map<string, string>> {
    const cities = await prisma.city.findMany({
        select: { insee_code: true, name: true },
    });

    const map = new Map<string, string>();
    cities.forEach(city => map.set(city.insee_code, city.name));
    return map;
}

function formatIgnoredTypes(ignored: Map<string, number>): string {
    if (ignored.size === 0) return 'none';
    return [...ignored.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');
}

function buildReport(missing: CsvCommune[], summary: {
    csvTotalRows: number;
    csvKept: number;
    dbCities: number;
    ignoredTypes: Map<string, number>;
    missingCode: number;
    duplicates: number;
}): string {
    const lines: string[] = [];
    lines.push('===========================================');
    lines.push('CODES INSEE MANQUANTS DANS LA BASE');
    lines.push('===========================================');
    lines.push(`Date: ${new Date().toLocaleString('fr-FR')}`);
    lines.push(`Lignes totales dans le CSV : ${summary.csvTotalRows}`);
    lines.push(`Communes conservées (COM + ARM) : ${summary.csvKept}`);
    lines.push(`Codes ignorés (autres TYPECOM) : ${formatIgnoredTypes(summary.ignoredTypes)}`);
    lines.push(`Lignes sans code COM : ${summary.missingCode}`);
    lines.push(`Doublons dans le CSV : ${summary.duplicates}`);
    lines.push(`Communes en base (codes INSEE) : ${summary.dbCities}`);
    lines.push(`Codes manquants dans la base : ${missing.length}`);
    lines.push('');

    if (missing.length === 0) {
        lines.push('✅ Tous les codes INSEE COM/ARM du CSV sont présents en base.');
        return lines.join('\n');
    }

    lines.push('Liste complète :');
    lines.push('code;type;nom');
    missing.forEach(({ code, type, name }) => {
        const safeName = name || '';
        lines.push(`${code};${type};${safeName}`);
    });

    return lines.join('\n');
}

async function main() {
    const { filePath } = parseArgs();
    const prisma = new PrismaClient();

    try {
        console.log(`${REPORT_PREFIX} Lecture du CSV...`);
        const { communes, stats } = await loadCsv(filePath);
        console.log(`${REPORT_PREFIX} Lignes CSV : ${stats.totalRows}`);
        console.log(`${REPORT_PREFIX} Communes conservées (COM/ARM) : ${stats.kept}`);
        if (stats.ignoredTypes.size > 0) {
            console.log(`${REPORT_PREFIX} Ignoré TYPECOM => ${formatIgnoredTypes(stats.ignoredTypes)}`);
        }

        console.log(`${REPORT_PREFIX} Chargement des villes depuis la DB...`);
        const dbCodes = await loadDbCodes(prisma);
        console.log(`${REPORT_PREFIX} Codes INSEE en base : ${dbCodes.size}`);

        const missing: CsvCommune[] = [];
        communes.forEach(commune => {
            if (!dbCodes.has(commune.code)) {
                missing.push(commune);
            }
        });

        missing.sort((a, b) => a.code.localeCompare(b.code));

        console.log(`${REPORT_PREFIX} Codes manquants : ${missing.length}`);
        if (missing.length > 0) {
            console.log(`${REPORT_PREFIX} Exemples : ${missing.slice(0, 10).map(c => c.code).join(', ')}`);
        }

        const report = buildReport(missing, {
            csvTotalRows: stats.totalRows,
            csvKept: stats.kept,
            dbCities: dbCodes.size,
            ignoredTypes: stats.ignoredTypes,
            missingCode: stats.missingCode,
            duplicates: stats.duplicates,
        });

        const outputFile = path.join(process.cwd(), `missing_insee_codes_${Date.now()}.txt`);
        fs.writeFileSync(outputFile, report, 'utf-8');

        console.log(`${REPORT_PREFIX} Rapport enregistré : ${outputFile}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(error => {
    console.error(`${REPORT_PREFIX} Erreur fatale`, error);
    process.exit(1);
});
