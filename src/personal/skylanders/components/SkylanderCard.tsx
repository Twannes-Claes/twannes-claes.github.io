import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback } from 'react';

import type { Skylander } from '../types';

interface SkylanderCardProps
{
    item: Skylander;
    onRemove: (item: Skylander) => void;
}

export function SkylanderCard({ item, onRemove }: SkylanderCardProps)
{
    const remove = useCallback(() => onRemove(item), [item, onRemove]);

    return (
        <li className="flex flex-col overflow-hidden rounded-[5px] border-2 border-edge">
            <div className="grid aspect-square place-items-center bg-paper">
                {item.image ? (
                    <img
                        src={item.image}
                        alt={item.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-contain"
                    />
                ) : (
                    <span className="font-mono text-4xl text-ink">?</span>
                )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                    {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="font-medium">
                            {item.name}
                        </a>
                    ) : (
                        <span className="font-medium">{item.name}</span>
                    )}
                    <button
                        type="button"
                        onClick={remove}
                        aria-label={`Remove ${item.name}`}
                        className="opacity-60 transition-opacity hover:opacity-100"
                    >
                        <FontAwesomeIcon icon={faTrash} />
                    </button>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                    {item.element && <span className="tag">{item.element}</span>}
                    {item.game && <span className="text-sm opacity-70">{item.game}</span>}
                </div>
            </div>
        </li>
    );
}
