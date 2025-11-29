 'use client';

import { Psychologist } from '@prisma/client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import PsychologistCard from './PsychologistCard';

interface Props {
    psychologists: Psychologist[];
    currentPage: number;
    totalPages: number;
    total: number;
    searchParams: { [key: string]: string | string[] | undefined };
}

export default function PsychologistList({ psychologists, currentPage, totalPages, total, searchParams }: Props) {
    const router = useRouter();
    const [isRouting, startTransition] = useTransition();

    const createPageLink = (page: number) => {
        const params = new URLSearchParams(searchParams as Record<string, string>);
        params.set('page', page.toString());
        return `/?${params.toString()}`;
    };

    return (
        <div className="w-full max-w-5xl mx-auto mt-12">
            <div className="mb-6">
                <h2 className="font-bold text-xl text-gray-800 leading-none">
                    {total} résultat{total > 1 ? 's' : ''} trouvé{total > 1 ? 's' : ''}
                </h2>
                <p className="text-xs text-gray-400 mt-1.5 font-medium">
                    Trié par ordre alphabétique
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {psychologists.map((psy) => (
                    <PsychologistCard key={psy.id_in} psy={psy} />
                ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-3 mt-12 mb-12">
                    {currentPage > 1 && (
                        <button
                            onClick={() => {
                                startTransition(() => {
                                    router.push(createPageLink(currentPage - 1));
                                });
                            }}
                            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 hover:text-primary transition-colors disabled:opacity-60"
                            disabled={isRouting}
                        >
                            Précédent
                        </button>
                    )}

                    <div className="flex items-center gap-1">
                        <span className="px-4 py-2 rounded-lg bg-primary text-white font-bold shadow-sm min-w-[52px] flex items-center justify-center">
                            {isRouting ? (
                                <span className="h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" aria-label="Chargement" />
                            ) : (
                                currentPage
                            )}
                        </span>
                        <span className="text-gray-400 font-medium px-2">/</span>
                        <span className="text-gray-600 font-medium">
                            {totalPages}
                        </span>
                    </div>

                    {currentPage < totalPages && (
                        <button
                            onClick={() => {
                                startTransition(() => {
                                    router.push(createPageLink(currentPage + 1));
                                });
                            }}
                            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 hover:text-primary transition-colors disabled:opacity-60"
                            disabled={isRouting}
                        >
                            Suivant
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
