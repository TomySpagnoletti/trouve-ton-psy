'use client';

import { Psychologist } from '@prisma/client';
import { useEffect, useState, useTransition } from 'react';
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
    const [showScrollTop, setShowScrollTop] = useState(false);

    const createPageLink = (page: number) => {
        const params = new URLSearchParams(searchParams as Record<string, string>);
        params.set('page', page.toString());
        return `/?${params.toString()}`;
    };

    useEffect(() => {
        const handleScroll = () => {
            const shouldShow = window.scrollY > 220;
            setShowScrollTop(shouldShow);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll(); // initialize based on current scroll position

        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

            <button
                type="button"
                onClick={scrollToTop}
                aria-label="Remonter en haut de la liste"
                className={`fixed bottom-5 right-4 md:bottom-6 md:right-6 rounded-full bg-primary text-white shadow-lg shadow-primary/20 transition-all duration-200 ease-out hover:translate-y-[-2px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/70 p-3 md:p-3.5 z-40 ${showScrollTop ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-5 w-5 md:h-6 md:w-6"
                >
                    <path d="M12 5.5a1 1 0 0 1 .8.4l6 7.5a1 1 0 1 1-1.6 1.2L12 7.93l-5.2 6.67a1 1 0 1 1-1.6-1.2l6-7.5a1 1 0 0 1 .8-.4Z" />
                </svg>
            </button>
        </div>
    );
}
