import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const city = searchParams.get('city');
    const publicAudience = searchParams.get('public');
    const visio = searchParams.get('visio');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 50;
    const skip = (page - 1) * limit;

    const where: Prisma.PsychologistWhereInput = {
        visible: true,
    };

    if (q) {
        where.OR = [
            { lastname: { contains: q, mode: 'insensitive' } },
            { firstname: { contains: q, mode: 'insensitive' } },
        ];
    }

    if (city) {
        where.address = { contains: city, mode: 'insensitive' };
    }

    if (publicAudience) {
        where.public = { has: publicAudience };
    }

    if (visio === 'true') {
        where.teleconsultation = true;
    }

    try {
        const [psychologists, total] = await Promise.all([
            prisma.psychologist.findMany({
                where,
                skip,
                take: limit,
                orderBy: { lastname: 'asc' },
            }),
            prisma.psychologist.count({ where }),
        ]);

        return NextResponse.json({
            data: psychologists,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Search error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
