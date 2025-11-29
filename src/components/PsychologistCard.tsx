'use client';

import { useState } from 'react';
import { Psychologist } from '@/generated/client/client';
import { getContactInfo } from '@/app/actions';

interface Props {
    psy: Psychologist;
}

export default function PsychologistCard({ psy }: Props) {
    const [phone, setPhone] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [loadingPhone, setLoadingPhone] = useState(false);
    const [loadingEmail, setLoadingEmail] = useState(false);

    const handleRevealPhone = async () => {
        if (phone || loadingPhone) return;
        setLoadingPhone(true);
        try {
            const data = await getContactInfo(psy.id_in);
            if ('error' in data) {
                console.error(data.error);
            } else if (data.phone) {
                setPhone(data.phone);
            } else {
                setPhone('Non renseigné');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingPhone(false);
        }
    };

    const handleRevealEmail = async () => {
        if (email || loadingEmail) return;
        setLoadingEmail(true);
        try {
            const data = await getContactInfo(psy.id_in);
            if ('error' in data) {
                console.error(data.error);
            } else if (data.email) {
                setEmail(data.email);
            } else {
                setEmail('Non renseigné');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingEmail(false);
        }
    };

    const safeWebsite = (() => {
        if (!psy.website) return null;
        try {
            const normalized = psy.website.startsWith('http')
                ? psy.website
                : `https://${psy.website}`;
            const url = new URL(normalized);
            if (url.protocol === 'http:' || url.protocol === 'https:') {
                return url.toString();
            }
        } catch (error) {
            console.error('Invalid website URL skipped:', error);
        }
        return null;
    })();

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 group">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">{psy.lastname} {psy.firstname}</h2>
                    <div className="flex flex-wrap gap-2">
                        {psy.public && psy.public.map((audience) => (
                            <span key={audience} className="inline-flex items-center gap-1 bg-blue-50 text-primary text-xs font-semibold px-3 py-1 rounded-full">
                                {audience === 'Enfants' && (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                )}
                                {audience === 'Adolescents' && (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                )}
                                {audience === 'Adultes' && (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                )}
                                {audience}
                            </span>
                        ))}
                        {psy.teleconsultation && (
                            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full border border-green-100">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                Visio
                            </span>
                        )}
                    </div>
                </div>
                <div className="mt-4 md:mt-0 md:text-right">
                    <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(psy.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-primary transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {psy.address}
                    </a>
                    {psy.address_additional && (
                        <p className="text-xs text-gray-400 mt-1">{psy.address_additional}</p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        </div>
                        {phone ? (
                            <span className="font-medium text-gray-700">{phone}</span>
                        ) : (
                            <button onClick={handleRevealPhone} className="text-primary hover:underline font-medium text-sm">
                                {loadingPhone ? 'Chargement...' : 'Voir le numéro'}
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        </div>
                        {email ? (
                            <span className="font-medium text-gray-700">{email}</span>
                        ) : (
                            <button onClick={handleRevealEmail} className="text-primary hover:underline font-medium text-sm">
                                {loadingEmail ? 'Chargement...' : 'Voir l\'email'}
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center md:justify-end">
                    {safeWebsite && (
                        <a href={safeWebsite} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                            Site Web
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
