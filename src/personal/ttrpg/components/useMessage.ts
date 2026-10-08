import { useEffect, useState } from 'react';

export interface Message
{
    text: string;
    kind: 'error' | 'done';
}

/** Long enough to read an error and act on it, a moment for a confirmation. */
const showFor = { error: 8000, done: 2500 };

/**
 * The one message a screen shows in its toast, see Toast in Feedback.tsx. A new message takes
 * the place of the old one, and each goes by itself after a while.
 */
export function useMessage()
{
    const [message, setMessage] = useState<Message | null>(null);

    useEffect(() =>
    {
        if (!message)
            return;

        const timer = window.setTimeout(() => setMessage(null), showFor[message.kind]);

        return () => window.clearTimeout(timer);
    }, [message]);

    return {
        message,
        error: (text: string) => setMessage({ text, kind: 'error' }),
        done: (text: string) => setMessage({ text, kind: 'done' }),
        clear: () => setMessage(null),
    };
}
