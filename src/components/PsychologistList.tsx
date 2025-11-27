import Link from 'next/link';
import { Psychologist } from '@/generated/client/client';

interface Props {
    psychologists: Psychologist[];
    currentPage: number;
    totalPages: number;
    total: number;
    searchParams: { [key: string]: string | string[] | undefined };
}

export default function PsychologistList({ psychologists, currentPage, totalPages, total, searchParams }: Props) {
    const createPageLink = (page: number) => {
        const params = new URLSearchParams(searchParams as Record<string, string>);
        params.set('page', page.toString());
        return `/?${params.toString()}`;
    };

    return (
        <div className="w-full max-w-4xl mx-auto mt-8">
            <div className="mb-4 font-bold text-xl">
                {total} résultat{total > 1 ? 's' : ''} trouvé{total > 1 ? 's' : ''}
            </div>

            <div className="grid grid-cols-1 gap-6">
                {psychologists.map((psy) => (
                    <div key={psy.id} className="border-2 border-black p-6 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all bg-white">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                            <div>
                                <h2 className="text-2xl font-black uppercase">{psy.lastname} {psy.firstname}</h2>
                                <div className="flex gap-2 mt-2">
                                    {psy.public && (
                                        <span className="bg-black text-white text-xs font-bold px-2 py-1 uppercase">
                                            {psy.public}
                                        </span>
                                    )}
                                    {psy.teleconsultation && (
                                        <span className="border-2 border-black text-black text-xs font-bold px-2 py-1 uppercase">
                                            Visio
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 md:mt-0 text-right">
                                <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(psy.address)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-bold underline hover:no-underline"
                                >
                                    {psy.address}
                                </a>
                                {psy.address_additional && (
                                    <p className="text-xs text-gray-600 mt-1">{psy.address_additional}</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm border-t-2 border-gray-100 pt-4 mt-4">
                            <div>
                                {psy.phone && (
                                    <p className="mb-1">
                                        <span className="font-bold">Tél:</span> {psy.phone}
                                    </p>
                                )}
                                {psy.email && (
                                    <p className="mb-1">
                                        <span className="font-bold">Email:</span> {psy.email}
                                    </p>
                                )}
                            </div>
                            <div className="md:text-right">
                                {psy.website && (
                                    <a href={psy.website} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                                        Site Web
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-8 mb-12">
                    {currentPage > 1 && (
                        <Link
                            href={createPageLink(currentPage - 1)}
                            className="border-2 border-black px-4 py-2 font-bold hover:bg-black hover:text-white transition-colors"
                        >
                            Précédent
                        </Link>
                    )}

                    <span className="border-2 border-black px-4 py-2 font-bold bg-black text-white">
                        Page {currentPage} / {totalPages}
                    </span>

                    {currentPage < totalPages && (
                        <Link
                            href={createPageLink(currentPage + 1)}
                            className="border-2 border-black px-4 py-2 font-bold hover:bg-black hover:text-white transition-colors"
                        >
                            Suivant
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}
