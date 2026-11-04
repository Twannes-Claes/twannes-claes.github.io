import { faNoteSticky, faPen, faThumbtack, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { flushSync } from 'react-dom';

import type { Note, Point } from '../types';

import { confirmAction } from '../services/confirm';

import { useKeydown } from './useKeys';

/** How far a press moves, in page pixels, before it drags a pin rather than opening it. */
const dragAfter = 4;

/** How long a card takes to grow into its form or shrink back to its words. */
const resizeMs = 200;

/**
 * Swaps what a card shows, its words or its form, with its height easing from the one to the other
 * rather than jumping, like the boxes in morph.ts. flushSync renders the new content at once, so it
 * can be measured. People who reduce motion just get the swap.
 */
function resized(card: HTMLElement | null, update: () => void)
{
    const from = card?.getBoundingClientRect().height;

    flushSync(update);

    if (!card || !from || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        return;

    // In the card's zoomed pixels, see the control size in useScreenSettings.ts.
    const zoom = Number(getComputedStyle(card).getPropertyValue('--ttrpg-ui')) || 1;
    const to = card.getBoundingClientRect().height;

    card.animate({ height: [`${from / zoom}px`, `${to / zoom}px`], overflow: ['hidden', 'hidden'] }, { duration: resizeMs, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
}

/**
 * The world point under a point of the page, from the camera MapCanvas.tsx writes onto the pins' layer,
 * which lies over the map exactly.
 */
function worldAt(element: Element, client: Point): Point
{
    const layer = element.closest<HTMLElement>('.ttrpg-pins');
    const read = (name: string) => parseFloat(layer?.style.getPropertyValue(name) ?? '') || 0;
    const zoom = read('--map-zoom') || 1;

    return { x: (client.x - read('--map-x')) / zoom, y: (client.y - read('--map-y')) / zoom };
}

/** Where a pin stands, in world pixels, for the stylesheet, see .ttrpg-pin-at. */
const placed = (at: Point) => ({ '--x': at.x, '--y': at.y }) as CSSProperties;

interface NoteFormProps
{
    note?: Note;
    onSave: (title: string, text: string) => void;
    onCancel: () => void;
}

/** A note's title and text being written, new or again. Ctrl+Enter in the text saves too. */
function NoteForm({ note, onSave, onCancel }: NoteFormProps)
{
    const [title, setTitle] = useState(note?.title ?? '');
    const [text, setText] = useState(note?.text ?? '');
    const save = () => onSave(title.trim(), text.trim());

    return (
        <form
            className="ttrpg-note__form"
            onSubmit={(event) =>
            {
                event.preventDefault();
                save();
            }}
        >
            <input aria-label="Title" placeholder="Title" value={title} maxLength={80} autoFocus onChange={(event) => setTitle(event.target.value)} />
            <textarea
                aria-label="Text"
                placeholder="What is in the chest, what the statue says"
                value={text}
                rows={4}
                maxLength={2000}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) =>
                {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey))
                    {
                        event.preventDefault();
                        save();
                    }
                }}
            />
            <div className="ttrpg-note__actions">
                <button type="button" className="ttrpg-segment" onClick={onCancel}>
                    Cancel
                </button>
                <button type="submit" className="ttrpg-segment ttrpg-segment--confirm">
                    Save
                </button>
            </div>
        </form>
    );
}

interface NotePinsProps
{
    notes: Note[];
    /** The notes opened in the GM view this live session, whose pins are paler. */
    read: string[];
    /** Hears a note opened, only where that counts as read: the GM view of a live session. */
    onRead?: (id: string) => void;
    /** The eraser is out, so a press on a pin takes it away. */
    erasing: boolean;
    /** Where the notes tool pressed, waiting for the new note's words, or null. */
    draft: Point | null;
    /** The draft was saved or dropped. It names the draft, as a press for a new one may come first. */
    onDraftDone: (draft: Point) => void;
    /** Changes the map's notes, as one step to undo. */
    onChange: (update: (notes: Note[]) => Note[]) => void;
}

/**
 * The GM's notes, as pins over the map in the accent colour, never on a player's screen. A mouse
 * over one peeks at its card, a press keeps it open and, where onRead listens, marks it read, so its
 * pin turns paler. A press on it again, Keep open or Esc closes the card, which stays while the map is
 * panned. A drag moves it.
 */
export function NotePins({ notes, read, onRead, erasing, draft, onDraftDone, onChange }: NotePinsProps)
{
    const [open, setOpen] = useState<{ id: string; editing: boolean } | null>(null);
    const [peek, setPeek] = useState<string | null>(null);
    const [drag, setDrag] = useState<{ id: string; pointerId: number; start: Point; offset: Point; at: Point | null } | null>(null);
    // A drag ends in a click on the pin, which must not open it.
    const dragged = useRef(false);
    // The card showing, only ever one, measured as it turns into its form and back.
    const card = useRef<HTMLElement>(null);
    const showing = open !== null || draft !== null;
    const drafting = draft !== null;

    const close = () =>
    {
        setOpen(null);

        if (draft)
            onDraftDone(draft);

    };

    useKeydown((event) =>
    {
        if (event.key === 'Escape' && showing && !document.querySelector('dialog[open]'))
            close();

    });

    // Only a new note goes with a press elsewhere. A kept card stays while the map is panned or used,
    // until its pin, its Keep open button or Esc lets it go.
    const pressed = useEffectEvent((event: globalThis.PointerEvent) =>
    {
        const target = event.target instanceof Element ? event.target : null;

        if (draft && target && !target.closest('.ttrpg-pin-at--open, dialog'))
            onDraftDone(draft);

    });

    useEffect(() =>
    {
        if (!drafting)
            return;

        // The press on the map that opened a draft reaches here too, as React renders between the
        // canvas's listener and this one, so only later presses count.
        const opened = performance.now();
        const press = (event: globalThis.PointerEvent) => event.timeStamp >= opened && pressed(event);

        document.addEventListener('pointerdown', press);

        return () => document.removeEventListener('pointerdown', press);
    }, [drafting]);

    const down = (event: PointerEvent, note: Note) =>
    {
        if (event.button !== 0 || erasing)
            return;

        const world = worldAt(event.currentTarget, { x: event.clientX, y: event.clientY });

        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ id: note.id, pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, offset: { x: note.x - world.x, y: note.y - world.y }, at: null });
    };

    const move = (event: PointerEvent) =>
    {
        if (!drag || drag.pointerId !== event.pointerId)
            return;

        if (!drag.at && Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < dragAfter)
            return;

        const world = worldAt(event.currentTarget, { x: event.clientX, y: event.clientY });

        setDrag({ ...drag, at: { x: world.x + drag.offset.x, y: world.y + drag.offset.y } });
    };

    const up = (event: PointerEvent) =>
    {
        if (!drag || drag.pointerId !== event.pointerId)
            return;

        const { id, at } = drag;

        setDrag(null);

        if (!at)
            return;

        dragged.current = true;
        onChange((current) => current.map((note) => (note.id === id ? { ...note, ...at } : note)));
    };

    // Asked first, like erasing mist, as a note holds what the GM wrote; Ctrl+Z still brings it back.
    const erase = (note: Note) =>
        void confirmAction(note.title ? `Erase the note "${note.title}"?` : 'Erase this note?', 'Erase').then((yes) =>
        {
            if (!yes)
                return;

            setOpen(null);
            onChange((current) => current.filter((other) => other.id !== note.id));
        });

    // Kept open, by a press on its pin or its card's pin button, which counts as reading it.
    const keep = (note: Note) =>
    {
        setOpen({ id: note.id, editing: false });

        if (!read.includes(note.id))
            onRead?.(note.id);

    };

    const pressPin = (note: Note) =>
    {
        if (dragged.current)
        {
            dragged.current = false;

            return;
        }

        if (erasing)
        {
            erase(note);

            return;
        }

        // Closed with the mouse still on the pin, which would peek at it again at once, so the peek
        // waits for the mouse to leave and come back.
        if (open?.id === note.id)
        {
            setOpen(null);
            setPeek(null);

            return;
        }

        keep(note);
    };

    const saveDraft = (at: Point, title: string, text: string) =>
    {
        if (title || text)
            onChange((current) => [...current, { id: crypto.randomUUID(), x: at.x, y: at.y, title, text }]);

        onDraftDone(at);
    };

    return (
        <div className={`ttrpg-pins__notes${erasing ? ' ttrpg-pins__notes--erasing' : ''}`}>
            {notes.map((note) =>
            {
                const at = drag?.id === note.id && drag.at ? drag.at : note;
                const kept = open?.id === note.id;
                // Hidden once a pin really moves, not on the press that may start a drag, or a click
                // on a peeked pin would pop its card in again.
                const shown = kept || (peek === note.id && !open && !drag?.at && !erasing);

                return (
                    <div
                        key={note.id}
                        className={`ttrpg-pin-at${kept ? ' ttrpg-pin-at--open' : ''}`}
                        style={placed(at)}
                        onPointerEnter={(event) => event.pointerType === 'mouse' && setPeek(note.id)}
                        onPointerLeave={() => setPeek(null)}
                    >
                        <button
                            type="button"
                            className={`ttrpg-pin${read.includes(note.id) ? ' ttrpg-pin--read' : ''}`}
                            aria-label={erasing ? `Erase ${note.title || 'this note'}` : note.title || 'Note'}
                            aria-expanded={kept}
                            onPointerDown={(event) => down(event, note)}
                            onPointerMove={move}
                            onPointerUp={up}
                            onPointerCancel={() => setDrag(null)}
                            onClick={() => pressPin(note)}
                        >
                            <FontAwesomeIcon icon={faNoteSticky} />
                        </button>
                        {shown && (
                            <section ref={card} className="ttrpg-panel ttrpg-note" aria-label={note.title || 'Note'}>
                                {kept && open.editing ? (
                                    <NoteForm
                                        note={note}
                                        onSave={(title, text) =>
                                        {
                                            resized(card.current, () =>
                                            {
                                                onChange((current) => current.map((other) => (other.id === note.id ? { ...other, title, text } : other)));
                                                setOpen({ id: note.id, editing: false });
                                            });
                                        }}
                                        onCancel={() => resized(card.current, () => setOpen({ id: note.id, editing: false }))}
                                    />
                                ) : (
                                    <>
                                        <header className="ttrpg-note__head">
                                            <h2>{note.title || 'Note'}</h2>
                                            {/* Shows whether the card stays open, as a press on the pin does; let go, it is a peek again. */}
                                            <button
                                                type="button"
                                                className="ttrpg-icon-button ttrpg-icon-button--small"
                                                aria-pressed={kept}
                                                aria-label="Keep open"
                                                title={kept ? 'Let it close' : 'Keep open'}
                                                onClick={() => (kept ? setOpen(null) : keep(note))}
                                            >
                                                <FontAwesomeIcon icon={faThumbtack} />
                                            </button>
                                            <button
                                                type="button"
                                                className="ttrpg-icon-button ttrpg-icon-button--small"
                                                aria-label="Edit"
                                                title="Edit"
                                                onClick={() => resized(card.current, () => setOpen({ id: note.id, editing: true }))}
                                            >
                                                <FontAwesomeIcon icon={faPen} />
                                            </button>
                                            <button
                                                type="button"
                                                className="ttrpg-icon-button ttrpg-icon-button--small"
                                                aria-label="Delete"
                                                title="Delete"
                                                onClick={() => erase(note)}
                                            >
                                                <FontAwesomeIcon icon={faTrash} />
                                            </button>
                                        </header>
                                        {note.text && <p className="ttrpg-note__text">{note.text}</p>}
                                    </>
                                )}
                            </section>
                        )}
                    </div>
                );
            })}
            {draft && (
                <div className="ttrpg-pin-at ttrpg-pin-at--open" style={placed(draft)}>
                    <span className="ttrpg-pin" aria-hidden="true">
                        <FontAwesomeIcon icon={faNoteSticky} />
                    </span>
                    <section className="ttrpg-panel ttrpg-note" aria-label="New note">
                        <NoteForm key={`${draft.x},${draft.y}`} onSave={(title, text) => saveDraft(draft, title, text)} onCancel={() => onDraftDone(draft)} />
                    </section>
                </div>
            )}
        </div>
    );
}
