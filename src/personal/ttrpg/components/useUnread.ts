import { useEffect, useState } from 'react';

import type { ChatMessage } from '../types';

import { buzz } from '../services/haptics';

/**
 * Whether the chat has something new since this screen last had it open, buzzing a phone when it
 * does. What was there when the page opened is not new.
 */
export function useUnread(messages: ChatMessage[] | undefined, open: boolean, phone = false): boolean
{
    const last = messages?.at(-1);
    const current = last?.id ?? null;
    // Undefined until the chat loads.
    const [seen, setSeen] = useState<string | null>();

    if (messages && (seen === undefined || open) && seen !== current)
        setSeen(current);

    const unread = seen !== undefined && seen !== current && !last?.mine;

    useEffect(() =>
    {
        if (phone && unread)
            buzz(80);

    }, [phone, unread, current]);

    return unread;
}
