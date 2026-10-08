import { useEffect, useState } from 'react';

/** How many steps back undo can go. */
const limit = 100;

interface History<T>
{
    past: T[];
    present: T;
    future: T[];
}

function undone<T>(history: History<T>): History<T>
{
    if (history.past.length === 0)
        return history;

    return {
        past: history.past.slice(0, -1),
        present: history.past[history.past.length - 1],
        future: [history.present, ...history.future],
    };
}

function redone<T>(history: History<T>): History<T>
{
    if (history.future.length === 0)
        return history;

    return {
        past: [...history.past, history.present],
        present: history.future[0],
        future: history.future.slice(1),
    };
}

/**
 * A value with undo and redo, on Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z too (Cmd on a Mac). commit
 * takes an updater, so two changes in a row before a render both land.
 */
export function useHistory<T>(initial: () => T)
{
    // ponytail: every commit is a step, so dragging a slider fills the history. Merge quick
    // commits into one step if that gets in the way.
    const [history, setHistory] = useState<History<T>>(() => ({
        past: [],
        present: initial(),
        future: [],
    }));

    useEffect(() =>
    {
        const keydown = (event: KeyboardEvent) =>
        {
            const key = event.key.toLowerCase();

            // A field keeps its own undo, for the text typed into it.
            if (!(event.ctrlKey || event.metaKey) || event.target instanceof HTMLInputElement)
                return;

            if (key === 'z' && !event.shiftKey)
                setHistory(undone);
            else if (key === 'y' || (key === 'z' && event.shiftKey))
                setHistory(redone);
            else
                return;

            event.preventDefault();
        };

        window.addEventListener('keydown', keydown);

        return () => window.removeEventListener('keydown', keydown);
    }, []);

    const commit = (update: (current: T) => T) =>
        setHistory((current) => ({
            past: [...current.past, current.present].slice(-limit),
            present: update(current.present),
            future: [],
        }));

    return {
        present: history.present,
        commit,
        undo: () => setHistory(undone),
        redo: () => setHistory(redone),
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
    };
}
