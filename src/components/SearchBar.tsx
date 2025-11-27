'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function SearchBar() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [q, setQ] = useState(searchParams.get('q') || '');
    const [city, setCity] = useState(searchParams.get('city') || '');
    const [publicAudience, setPublicAudience] = useState(searchParams.get('public') || '');
    const [visio, setVisio] = useState(searchParams.get('visio') === 'true');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (city) params.set('city', city);
        if (publicAudience) params.set('public', publicAudience);
        if (visio) params.set('visio', 'true');

        // Reset page to 1 on new search
        params.set('page', '1');

        router.push(`/?${params.toString()}`);
    };

    return (
        <div className="w-full max-w-4xl mx-auto bg-white border-2 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all">
            <form onSubmit={handleSearch} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col">
                        <label className="font-bold mb-1">Nom du praticien</label>
                        <input
                            type="text"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Ex: Patrick Brun"
                            className="border-2 border-black p-2 focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="font-bold mb-1">Ville</label>
                        <input
                            type="text"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="Ex: Bordeaux"
                            className="border-2 border-black p-2 focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="flex flex-col">
                        <label className="font-bold mb-1">Public</label>
                        <select
                            value={publicAudience}
                            onChange={(e) => setPublicAudience(e.target.value)}
                            className="border-2 border-black p-2 bg-white focus:outline-none focus:ring-2 focus:ring-black appearance-none"
                        >
                            <option value="">Tous</option>
                            <option value="Adultes">Adultes</option>
                            <option value="Enfants">Enfants</option>
                            <option value="Adolescents">Adolescents</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                        <input
                            type="checkbox"
                            id="visio"
                            checked={visio}
                            onChange={(e) => setVisio(e.target.checked)}
                            className="w-5 h-5 border-2 border-black text-black focus:ring-black"
                        />
                        <label htmlFor="visio" className="font-bold cursor-pointer">
                            Consultation vidéo
                        </label>
                    </div>

                    <button
                        type="submit"
                        className="bg-black text-white font-bold py-2 px-4 hover:bg-gray-800 transition-colors border-2 border-black active:translate-y-1 active:shadow-none"
                    >
                        RECHERCHER
                    </button>
                </div>
            </form>
        </div>
    );
}
