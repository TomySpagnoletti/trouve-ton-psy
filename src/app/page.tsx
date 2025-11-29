import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import SearchBar from '@/components/SearchBar';
import PsychologistList from '@/components/PsychologistList';
import ContactEmail from '@/components/ContactEmail';
import { Prisma, Psychologist } from '@prisma/client';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const city = typeof params.city === 'string' ? params.city : '';
  const publicAudience = typeof params.public === 'string' ? params.public : '';
  const visio = params.visio === 'true';
  const parsedPage = typeof params.page === 'string' ? parseInt(params.page, 10) : 1;
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  // Extract first postal code inside parentheses (supports single code, comma list, or range like 12345...67890)
  const postalCodeMatch = city.match(/\((\d{5})/);
  const cityNameOnly = postalCodeMatch ? city.replace(/\s*\([^)]*\)\s*$/, '').trim() : city;

  const hasSearch = Boolean(city || publicAudience || visio);

  let psychologists: Psychologist[] = [];
  let total = 0;

  if (hasSearch) {
    const where: Prisma.PsychologistWhereInput = {
      visible: true,
    };

    if (city) {
      // Use cityNameOnly for address search (without postal code)
      where.address = { contains: cityNameOnly, mode: 'insensitive' };
    }

    if (publicAudience) {
      where.public = { has: publicAudience };
    }

    if (visio) {
      where.teleconsultation = true;
    }

    try {
      let fetchedPsychologists: Psychologist[] = [];

      // Geolocation search if city is provided
      let geoSearchPerformed = false;
      if (city) {
        // 1. Find the city coordinates using postal code
        // Extract postal code (already extracted at the top)
        const postalCode = postalCodeMatch ? postalCodeMatch[1].split('...')[0] : null;

        let cityData;

        if (postalCode) {
          // Search by postal code ONLY - reliable and guaranteed to exist
          cityData = await prisma.city.findFirst({
            where: {
              postal_codes: {
                has: postalCode,
              },
            },
          });
        }
        // No fallback - if no postal code in the query, we won't do GPS search
        // We'll rely on the address-based fallback instead (line 167-178)

        if (cityData && cityData.center_latitude && cityData.center_longitude) {
          geoSearchPerformed = true;
          const lat = cityData.center_latitude;
          const lon = cityData.center_longitude;
          const radiusKm = 15;

          // 2. Raw SQL query for Haversine distance
          // We also include other filters (public, visio) in the SQL

          let sqlWhere = Prisma.sql`WHERE visible = true`;

          if (publicAudience) {
            sqlWhere = Prisma.sql`${sqlWhere} AND ${publicAudience} = ANY(public)`;
          }
          if (visio) {
            sqlWhere = Prisma.sql`${sqlWhere} AND teleconsultation = true`;
          }

          // Calculate distance using Haversine formula
          // 6371 is Earth radius in km
          // coordinates_x is Longitude, coordinates_y is Latitude
          fetchedPsychologists = await prisma.$queryRaw`
            SELECT *,
            (
              6371 * acos(
                cos(radians(${lat})) * cos(radians(coordinates_y)) *
                cos(radians(coordinates_x) - radians(${lon})) +
                sin(radians(${lat})) * sin(radians(coordinates_y))
              )
            ) AS distance
            FROM "Psychologist"
            ${sqlWhere}
            AND coordinates_x IS NOT NULL 
            AND coordinates_y IS NOT NULL
            AND (
              6371 * acos(
                cos(radians(${lat})) * cos(radians(coordinates_y)) *
                cos(radians(coordinates_x) - radians(${lon})) +
                sin(radians(${lat})) * sin(radians(coordinates_y))
              )
            ) < ${radiusKm}
            ORDER BY lastname ASC
            LIMIT ${limit}
            OFFSET ${skip}
          `;

          // Count total for pagination (approximate or separate query)
          const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*)::int as count
            FROM "Psychologist"
            ${sqlWhere}
            AND coordinates_x IS NOT NULL 
            AND coordinates_y IS NOT NULL
            AND (
              6371 * acos(
                cos(radians(${lat})) * cos(radians(coordinates_y)) *
                cos(radians(coordinates_x) - radians(${lon})) +
                sin(radians(${lat})) * sin(radians(coordinates_y))
              )
            ) < ${radiusKm}
          `;
          total = Number(countResult[0]?.count || 0);
        }
      }

      // Fallback to standard Prisma query if no geo search was performed
      if (!geoSearchPerformed) {
        [fetchedPsychologists, total] = await Promise.all([
          prisma.psychologist.findMany({
            where,
            skip,
            take: limit,
            orderBy: { lastname: 'asc' },
          }),
          prisma.psychologist.count({ where }),
        ]);
      }

      // Sanitize data for security (phone/email fetched on demand)
      psychologists = fetchedPsychologists.map(p => ({
        ...p,
        phone: null,
        email: null
      }));

    } catch (error) {
      console.error('Database error:', error);
      // Handle error gracefully (e.g. empty list)
    }
  }

  return (
    <main className="min-h-screen flex flex-col p-2 md:p-4 max-w-7xl mx-auto font-sans">
      <div className="flex-1 flex flex-col">
        {/* Header / Hero Section */}
        <div className={`transition-all duration-500 ease-in-out ${hasSearch ? 'mb-8' : 'flex flex-col items-center justify-center min-h-[60vh]'}`}>

          {!hasSearch && (
            <div className="text-center mb-12 max-w-2xl">
              <h1 className="text-4xl md:text-5xl font-black mb-6 tracking-tight text-primary-dark">TROUVE TON <span className="underline decoration-4 decoration-primary/30">SOUTIEN</span> PSY</h1>
              <p className="text-xl font-medium leading-relaxed text-gray-700">
                L‘annuaire officiel ne filtre pas par spécialité.
                <br />
                Trouvez le psychologue qui <span className="text-primary font-bold underline decoration-4 decoration-primary/30">vous</span> correspond.
              </p>
              <p className="mt-6 text-gray-500">
                Recherche par ville, par <span className="font-bold">spécialité</span> et téléconsultation.
                <br />
                Simple. Rapide. Efficace.
              </p>
            </div>
          )}

          {hasSearch && (
            <div className="flex items-center justify-between mb-8 w-full border-b border-gray-200 pb-4">
              <h1 className="text-2xl font-black tracking-tight text-primary-dark">
                <Link href="/" className="hover:underline">TROUVE TON SOUTIEN PSY</Link>
              </h1>
              <Link href="/" className="text-sm font-bold text-primary hover:underline">Nouvelle recherche</Link>
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
      </div>

      {!hasSearch && (
        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>
            Données officielles &quot;Mon Soutien Psy&quot; • Mis à jour régulièrement • <ContactEmail />
          </p>
        </footer>
      )}
    </main>
  );
}
