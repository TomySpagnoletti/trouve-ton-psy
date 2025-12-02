'use server';

import { prisma } from '@/lib/prisma';

const contactRateWindowMs = 10_000;
const contactRateLimit = 50;
const contactTimestamps =
    (global as unknown as { __contactRequests?: number[] }).__contactRequests ||
    [];
(global as unknown as { __contactRequests?: number[] }).__contactRequests =
    contactTimestamps;

export async function getContactInfo(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
        return { error: 'Invalid request' };
    }

    const now = Date.now();
    contactTimestamps.push(now);
    // Keep only recent timestamps
    while (contactTimestamps.length && contactTimestamps[0] < now - contactRateWindowMs) {
        contactTimestamps.shift();
    }
    if (contactTimestamps.length > contactRateLimit) {
        return { error: 'Too many requests. Please try again shortly.' };
    }

    try {
        const psychologist = await prisma.psychologist.findUnique({
            where: { id_in: id, visible: true },
            select: {
                phone: true,
                email: true,
            },
        });

        if (!psychologist) {
            return { error: 'Psychologist not found' };
        }

        return {
            phone: psychologist.phone,
            email: psychologist.email,
        };
    } catch (error) {
        console.error('Error fetching contact info:', error);
        return { error: 'Failed to fetch contact info' };
    }
}

export async function searchCities(query: string) {
    const normalized = query.trim();
    if (normalized.length < 2) return [];
    const normalizedLower = normalized.toLowerCase();
    const maxResults = 5;
    const isPostalQuery = /^\d{2,5}$/.test(normalized);
    const suggestions: string[] = [];
    const seen = new Set<string>();

    try {
        if (isPostalQuery) {
            const postalMatches = await prisma.$queryRaw<{ name: string; postal_code: string }[]>`
                SELECT c.name, cp.postal_code
                FROM "CityPostal" AS cp
                JOIN "City" AS c ON c.id = cp.city_id
                WHERE cp.postal_code LIKE ${normalized + '%'}
                ORDER BY cp.postal_code ASC, c.name ASC
                LIMIT ${maxResults}
            `;

            for (const match of postalMatches) {
                const display = `${match.name} (${match.postal_code})`;
                if (!seen.has(display)) {
                    suggestions.push(display);
                    seen.add(display);
                    if (suggestions.length >= maxResults) {
                        return suggestions;
                    }
                }
            }
        }

        const remaining = maxResults - suggestions.length;
        if (remaining <= 0) return suggestions;

        // Single query for city names with ranked ordering
        const cityLimit = Math.max(remaining * 3, 8);
        const containsPattern = `%${normalizedLower}%`;
        const prefixPattern = `${normalizedLower}%`;

        const cityMatches = await prisma.$queryRaw<{ name: string; postal_codes: string[]; rank: number }[]>`
            SELECT c.name,
                   c.postal_codes,
                   CASE
                     WHEN lower(c.name) = ${normalizedLower} THEN 0
                     WHEN lower(c.name) LIKE ${prefixPattern} THEN 1
                     ELSE 2
                   END AS rank
            FROM "City" AS c
            WHERE lower(c.name) LIKE ${containsPattern}
            ORDER BY rank ASC, c.name ASC
            LIMIT ${cityLimit}
        `;

        for (const city of cityMatches) {
            if (suggestions.length >= maxResults) break;

            const codes = city.postal_codes.slice().sort();
            let postalDisplay = '';
            if (codes.length > 2) {
                postalDisplay = `${codes[0]}...${codes[codes.length - 1]}`;
            } else {
                postalDisplay = codes.join(', ');
            }
            const display = `${city.name} (${postalDisplay})`;
            if (display && !seen.has(display)) {
                suggestions.push(display);
                seen.add(display);
            }
        }

        return suggestions;
    } catch (error) {
        console.error('Error searching cities:', error);
        return [];
    }
}
