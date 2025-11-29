'use client';

import { useState } from 'react';

export default function ContactEmail() {
    const [revealed, setRevealed] = useState(false);
    const [email, setEmail] = useState('#');

    const handleReveal = (e: React.MouseEvent) => {
        e.preventDefault();
        if (!revealed) {
            const revealedEmail = 't' + 'r' + 'o' + 'u' + 'v' + 'e' + 't' + 'o' + 'n' + 'p' + 's' + 'y' + '@' + 'b' + 'r' + 'a' + 'i' + 'n' + 'r' + 'o' + 'a' + 'd' + '.' + 'x' + 'y' + 'z';
            setEmail(`mailto:${revealedEmail}`);
            setRevealed(true);
        }
    };

    return (
        <a
            href={email}
            onClick={handleReveal}
            className="hover:text-primary transition-colors cursor-pointer"
        >
            {revealed ? 'trouvetonpsy@brainroad.xyz' : 'Contactez-nous'}
        </a>
    );
}
