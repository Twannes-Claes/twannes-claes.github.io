import { faCheck, faTriangleExclamation, faXmark, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { ReactNode } from 'react';

/** A small turning ring, for anything that is on its way. */
export function Spinner()
{
    return <span className="ttrpg-spinner" aria-hidden="true" />;
}

/** A line with a spinner, for a page or a list that is still loading. */
export function Loading({ children }: { children: ReactNode })
{
    return (
        <p className="ttrpg-loading" role="status">
            <Spinner />
            {children}
        </p>
    );
}

/** The column under the top bar that toasts stack in, so two never cover each other. */
export function Toasts({ children }: { children: ReactNode })
{
    return <div className="ttrpg-toasts">{children}</div>;
}

interface ToastProps
{
    /** Busy shows a spinner, info the icon it is given. */
    kind: 'error' | 'done' | 'busy' | 'info';
    icon?: IconDefinition;
    /** Adds a close button. */
    onClose?: () => void;
    children: ReactNode;
}

/** One message in the toast column: something that went wrong, that worked, or that is running. */
export function Toast({ kind, icon, onClose, children }: ToastProps)
{
    let mark: ReactNode = icon && <FontAwesomeIcon icon={icon} />;

    if (kind === 'busy')
        mark = <Spinner />;
    else if (kind === 'error')
        mark = <FontAwesomeIcon icon={faTriangleExclamation} />;
    else if (kind === 'done')
        mark = <FontAwesomeIcon icon={faCheck} />;

    return (
        <div className={`ttrpg-panel ttrpg-toast ttrpg-toast--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
            {mark}
            <span>{children}</span>
            {onClose && (
                <button
                    type="button"
                    className="ttrpg-icon-button ttrpg-icon-button--small"
                    aria-label="Dismiss"
                    title="Dismiss"
                    onClick={onClose}
                >
                    <FontAwesomeIcon icon={faXmark} />
                </button>
            )}
        </div>
    );
}
