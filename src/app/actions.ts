'use server';

import { prisma } from '@/lib/prisma';

export async function getContactInfo(id: number) {
    // Simulate a delay to make it feel like a secure query if it's too fast
    // await new Promise(resolve => setTimeout(resolve, 300));

    try {
        const psychologist = await prisma.psychologist.findUnique({
            where: { id_in: id },
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
    if (query.length < 3) return [];

    try {
        // Fetch more results to allow for better sorting
        const cities = await prisma.city.findMany({
            where: {
                name: {
                    contains: query,
                    mode: 'insensitive',
                },
            },
            take: 30, // Get more results to filter and sort
            select: {
                name: true,
                postal_codes: true,
            },
        });

        const queryLower = query.toLowerCase();

        // Sort by relevance: exact match > starts with > contains
        const sortedCities = cities.sort((a, b) => {
            const aNameLower = a.name.toLowerCase();
            const bNameLower = b.name.toLowerCase();

            // Exact match comes first
            if (aNameLower === queryLower && bNameLower !== queryLower) return -1;
            if (bNameLower === queryLower && aNameLower !== queryLower) return 1;

            // Then startsWith
            const aStarts = aNameLower.startsWith(queryLower);
            const bStarts = bNameLower.startsWith(queryLower);
            if (aStarts && !bStarts) return -1;
            if (bStarts && !aStarts) return 1;

            // Finally alphabetical for same relevance
            return a.name.localeCompare(b.name);
        });

        // Take only the top 5 most relevant
        return sortedCities
            .slice(0, 5)
            .map(c => {
                const codes = c.postal_codes.sort();
                let postalDisplay = '';
                if (codes.length > 2) {
                    postalDisplay = `${codes[0]}...${codes[codes.length - 1]}`;
                } else {
                    postalDisplay = codes.join(', ');
                }
                return `${c.name} (${postalDisplay})`;
            });
    } catch (error) {
        console.error('Error searching cities:', error);
        return [];
    }
}
