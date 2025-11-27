import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import SearchBar from '@/components/SearchBar';
import PsychologistList from '@/components/PsychologistList';
import { Prisma, Psychologist } from '@/generated/client/client';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : '';
  const city = typeof params.city === 'string' ? params.city : '';
  const publicAudience = typeof params.public === 'string' ? params.public : '';
  const visio = params.visio === 'true';
  const page = typeof params.page === 'string' ? parseInt(params.page) : 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  const hasSearch = q || city || publicAudience || visio;

  let psychologists: Psychologist[] = [];
  let total = 0;

  if (hasSearch) {
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

    if (visio) {
      where.teleconsultation = true;
    }

    try {
      [psychologists, total] = await Promise.all([
        prisma.psychologist.findMany({
          where,
          skip,
          take: limit,
          orderBy: { lastname: 'asc' },
        }),
        prisma.psychologist.count({ where }),
      ]);
    } catch (error) {
      console.error('Database error:', error);
      // Handle error gracefully (e.g. empty list)
    }
  }

  return (
    <main className="min-h-screen flex flex-col p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header / Hero Section */}
      <div className={`transition-all duration-500 ease-in-out ${hasSearch ? 'mb-8' : 'flex flex-col items-center justify-center min-h-[60vh]'}`}>

        {!hasSearch && (
          <div className="text-center mb-12 max-w-2xl">
            <h1 className="text-6xl font-black mb-6 tracking-tighter">TROUVE TON PSY</h1>
            <p className="text-xl font-medium leading-relaxed">
              Le moteur de recherche du gouvernement est insuffisant.
              <br />
              Trouvez le psychologue qui <span className="underline decoration-4 decoration-black">vous</span> correspond.
            </p>
            <p className="mt-4 text-gray-600">
              Recherche par nom, ville, spécialité et téléconsultation.
              <br />
              Simple. Rapide. Efficace.
            </p>
          </div>
        )}

        {hasSearch && (
          <div className="flex items-center justify-between mb-8 w-full border-b-2 border-black pb-4">
            <h1 className="text-2xl font-black tracking-tighter">TROUVE TON PSY</h1>
            <Link href="/" className="text-sm font-bold underline">Nouvelle recherche</Link>
          </div>
        )}

        {/* Sticky Search Bar Container */}
        <div className={`${hasSearch ? 'sticky top-4 z-50' : 'w-full'}`}>
          <SearchBar />
        </div>
      </div>

      {/* Results Section */}
      {hasSearch && (
        <PsychologistList
          psychologists={psychologists}
          currentPage={page}
          totalPages={Math.ceil(total / limit)}
          total={total}
          searchParams={params}
        />
      )}

      {!hasSearch && (
        <footer className="mt-auto text-center text-sm text-gray-500 py-8">
          <p>Données officielles &quot;Mon Soutien Psy&quot; • Mis à jour régulièrement</p>
        </footer>
      )}
    </main>
  );
}
