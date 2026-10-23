import { faDownload, faFloppyDisk, faImage, faSkull, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Preset } from '../types';

import { statsOf } from '../content/statBlocks';
import { confirmAction } from '../services/confirm';

import { StatBlock } from './StatBlock';

interface PresetDialogProps
{
    /** The preset being changed, or what a new one starts from, without an id. */
    preset: Preset | Omit<Preset, 'id'>;
    /** With a new picture, or null to keep the one it has. */
    onSave: (preset: Omit<Preset, 'id' | 'avatar'>, picture: File | null) => Promise<void>;
    /** Only for a saved preset. */
    onRemove?: () => Promise<void>;
    onClose: () => void;
}

/** A preset's picture in its ring, or its initial on the ring's colour without one. */
export function PresetFace({ preset }: { preset: Pick<Preset, 'name' | 'color' | 'avatar'> })
{
    return (
        <span className="ttrpg-preset-face" style={{ borderColor: preset.color, background: preset.avatar ? undefined : preset.color }}>
            {preset.avatar ? <img src={preset.avatar} alt="" /> : preset.name.slice(0, 1).toUpperCase()}
        </span>
    );
}

/**
 * Writing a monster preset: its Markdown beside the stat block it makes, see content/statBlocks.ts,
 * with the picture and ring its monsters get. The name is its # heading. A native dialog, so Esc
 * and focus work; leaving with changes asks.
 */
export function PresetDialog({ preset, onSave, onRemove, onClose }: PresetDialogProps)
{
    const dialog = useRef<HTMLDialogElement>(null);
    const [markdown, setMarkdown] = useState(preset.markdown);
    const [downs, setDowns] = useState(preset.downs);
    const [color, setColor] = useState(preset.color);
    const [picture, setPicture] = useState<File | null>(null);
    // The picked picture as an address to show before it is saved, let go once it is replaced.
    const [preview, setPreview] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState('');
    const saved = 'id' in preset;
    const edited = markdown !== preset.markdown || downs !== preset.downs || color !== preset.color || picture !== null;
    const name = statsOf(markdown).name;

    useEffect(() => dialog.current?.showModal(), []);

    useEffect(() => () =>
    {
        if (preview)
            URL.revokeObjectURL(preview);

    }, [preview]);

    const pickPicture = (file: File | undefined) =>
    {
        setPicture(file ?? null);
        setPreview(file ? URL.createObjectURL(file) : null);
    };

    const leave = () =>
    {
        if (!edited)
            return onClose();

        void confirmAction('Close without saving?', 'Close').then((yes) =>
        {
            if (yes)
                onClose();

        });
    };

    const run = (call: Promise<void>) =>
    {
        setBusy(true);
        setFailure('');
        call.then(onClose, (reason: Error) =>
        {
            setFailure(reason.message);
            setBusy(false);
        });
    };

    const remove = () =>
    {
        void confirmAction(`Delete the ${preset.name} preset?`, 'Delete').then((yes) =>
        {
            if (yes && onRemove)
                run(onRemove());

        });
    };

    // The stat block as it reads now, as a .md file, to keep or share.
    const download = () =>
    {
        const link = document.createElement('a');

        link.href = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
        link.download = `${name || 'Monster'}.md`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    // In the app's own root, like a popover, so the panel it opens from does not style it.
    return createPortal(
        <dialog
            ref={dialog}
            className="ttrpg-confirm ttrpg-preset"
            aria-label="Monster preset"
            onCancel={(event) =>
            {
                event.preventDefault();
                leave();
            }}
        >
            <header className="ttrpg-popover__header">
                <h2>{saved ? 'Edit preset' : 'New preset'}</h2>
                <span className="ttrpg-preset__actions">
                    <button type="button" className="ttrpg-icon-button ttrpg-icon-button--small" aria-label="Download as .md" title="Download as .md" onClick={download}>
                        <FontAwesomeIcon icon={faDownload} />
                    </button>
                    <button type="button" className="ttrpg-icon-button ttrpg-icon-button--small" aria-label="Close" title="Close (Esc)" onClick={leave}>
                        <FontAwesomeIcon icon={faXmark} />
                    </button>
                </span>
            </header>
            <div className="ttrpg-preset__look">
                <PresetFace preset={{ name: name || '?', color, avatar: preview ?? preset.avatar }} />
                <label className="ttrpg-segment">
                    <FontAwesomeIcon icon={faImage} />
                    <span>{picture?.name ?? (preset.avatar ? 'Replace the picture' : 'Choose a picture')}</span>
                    <input type="file" accept="image/*" className="ttrpg-hidden-input" onChange={(event) => pickPicture(event.target.files?.[0])} />
                </label>
                <label className="ttrpg-preset__ring">
                    Ring
                    <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
                </label>
            </div>
            <div className="ttrpg-preset__panes">
                <textarea
                    className="ttrpg-preset__markdown"
                    aria-label="Stat block in Markdown"
                    value={markdown}
                    maxLength={20_000}
                    spellCheck={false}
                    autoFocus
                    onChange={(event) => setMarkdown(event.target.value)}
                />
                <div className="ttrpg-preset__preview">
                    <StatBlock markdown={markdown} />
                </div>
            </div>
            {failure && (
                <p className="ttrpg-error" role="alert">
                    {failure}
                </p>
            )}
            <footer className="ttrpg-preset__foot">
                <button
                    type="button"
                    className="ttrpg-segment"
                    aria-pressed={downs}
                    title="At 0 HP it goes down like a player instead of dying"
                    onClick={() => setDowns(!downs)}
                >
                    <FontAwesomeIcon icon={faSkull} />
                    Downable
                </button>
                {onRemove && (
                    <button type="button" className="ttrpg-segment" disabled={busy} onClick={remove}>
                        <FontAwesomeIcon icon={faTrash} />
                        Delete
                    </button>
                )}
                <button
                    type="button"
                    className="ttrpg-segment ttrpg-segment--confirm"
                    // A new one saves as it is too, so the template can be kept to fill in later.
                    disabled={busy || (saved && !edited)}
                    onClick={() => run(onSave({ name, markdown, downs, color }, picture))}
                >
                    <FontAwesomeIcon icon={faFloppyDisk} />
                    {busy ? 'Saving' : 'Save'}
                </button>
            </footer>
        </dialog>,
        document.querySelector('.ttrpg') ?? document.body,
    );
}
