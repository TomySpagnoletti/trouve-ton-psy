'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { searchCities } from '@/app/actions';

export default function SearchBar() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [city, setCity] = useState(searchParams.get('city') || '');
    const [publicAudience, setPublicAudience] = useState(searchParams.get('public') || '');
    const [visio, setVisio] = useState(searchParams.get('visio') === 'true');

    // Autocomplete state
    const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestRequestId = useRef(0);
    const suggestionsCache = useRef<Map<string, string[]>>(new Map());
    const [isFetchingCities, setIsFetchingCities] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPending, startTransition] = useTransition();
    const searchKey = searchParams.toString();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        // Reset loading state after navigation completes
        if (!isPending) {
            setIsSubmitting(false);
        }
    }, [searchKey, isPending]);

    const handleCityChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setCity(value);
        setSelectedIndex(-1);

        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        const normalized = value.trim();
        const cacheKey = normalized.toLowerCase();
        const requestId = ++latestRequestId.current;

        if (normalized.length < 3) {
            setIsFetchingCities(false);
            setCitySuggestions([]);
            setShowSuggestions(false);
            return;
        }

        const cached = suggestionsCache.current.get(cacheKey);
        if (cached) {
            setIsFetchingCities(false);
            setCitySuggestions(cached);
            setShowSuggestions(true);
            return;
        }

        debounceTimeoutRef.current = setTimeout(async () => {
            try {
                setIsFetchingCities(true);
                const results = await searchCities(normalized);
                if (requestId !== latestRequestId.current) return;
                suggestionsCache.current.set(cacheKey, results);
                setCitySuggestions(results);
                setShowSuggestions(true);
            } catch (error) {
                if (requestId !== latestRequestId.current) return;
                console.error('City search failed:', error);
                setShowSuggestions(false);
            } finally {
                if (requestId === latestRequestId.current) {
                    setIsFetchingCities(false);
                }
            }
        }, 120);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showSuggestions || citySuggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < citySuggestions.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
        } else if (e.key === 'Enter') {
            if (selectedIndex >= 0) {
                e.preventDefault();
                e.stopPropagation();
                selectCity(citySuggestions[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const selectCity = (selectedCity: string) => {
        // Keep the full "City (CP)" string so the CP is available for the geo search
        setCity(selectedCity);
        setShowSuggestions(false);
        setSelectedIndex(-1);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (city) params.set('city', city);
        if (publicAudience) params.set('public', publicAudience);
        if (visio) params.set('visio', 'true');

        // Reset page to 1 on new search
        params.set('page', '1');

        setIsSubmitting(true);
        startTransition(() => {
            router.push(`/?${params.toString()}`);
        });
    };

    return (
        <div className="w-full max-w-5xl mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 p-4 transition-all">
            <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 items-center">

                <div className="flex-1 w-full md:w-auto flex flex-col relative" ref={wrapperRef}>
                    <label className="text-xs font-semibold text-gray-500 mb-1 ml-1 uppercase tracking-wide">Ville</label>
                    <div className="relative">
                        <input
                            type="text"
                            name="city_search"
                            id="city_search"
                            autoComplete="off"
                            data-1p-ignore
                            value={city}
                            onChange={handleCityChange}
                            onKeyDown={handleKeyDown}
                            onFocus={() => city.length >= 3 && setShowSuggestions(true)}
                            placeholder="Ex: Bordeaux"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                        {isFetchingCities && (
                            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                                <span className="h-4 w-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" aria-label="Chargement des villes" />
                            </div>
                        )}
                    </div>
                    {showSuggestions && citySuggestions.length > 0 && (
                        <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                            {citySuggestions.map((suggestion, index) => (
                                <li
                                    key={index}
                                    onClick={() => selectCity(suggestion)}
                                    className={`px-4 py-2 cursor-pointer text-sm transition-colors ${index === selectedIndex
                                        ? 'bg-gray-200 text-primary font-bold'
                                        : 'hover:bg-gray-50 text-gray-700 font-medium'
                                        }`}
                                >
                                    {suggestion}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex-1 w-full md:w-auto flex flex-col">
                    <label className="text-xs font-semibold text-gray-500 mb-1 ml-1 uppercase tracking-wide">Public</label>
                    <div className="relative">
                        <select
                            value={publicAudience}
                            onChange={(e) => setPublicAudience(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
                        >
                            <option value="">Tous</option>
                            <option value="Adultes">Adultes</option>
                            <option value="Enfants">Enfants</option>
                            <option value="Adolescents">Adolescents</option>
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="flex items-center h-full pt-6">
                    <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-xl hover:bg-gray-50 transition-colors">
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${visio ? 'bg-primary border-primary' : 'border-gray-300 group-hover:border-primary'}`}>
                            {visio && (
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </div>
                        <input
                            type="checkbox"
                            checked={visio}
                            onChange={(e) => setVisio(e.target.checked)}
                            className="hidden"
                        />
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700 group-hover:text-primary transition-colors">Visio</span>
                            <svg className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>
                    </label>
                </div>

                <div className="pt-6 w-full md:w-auto">
                    <button
                        type="submit"
                        className="w-full md:w-auto bg-primary text-white font-bold py-3 px-8 rounded-xl hover:bg-primary-dark transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
                        disabled={isSubmitting || isPending}
                    >
                        {isSubmitting || isPending ? (
                            <span className="flex items-center gap-2">
                                <span className="h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                                Recherche...
                            </span>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                Trouver
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
