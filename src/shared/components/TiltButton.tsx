import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';

/** Picks -magnitude or +magnitude. */
function randomDeg(magnitude: number): number
{
    return Math.random() < 0.5 ? -magnitude : magnitude;
}

interface TiltButtonProps
{
    children: ReactNode;
    /** Extra modifiers, such as 'button--icon' or 'button--back'. */
    className?: string;
    /** Tilt in degrees. 3 for full-size buttons, 12 for icon-only ones. */
    magnitude?: number;
}

/**
 * Button chrome with the random hover tilt from the old button-tilt.js.
 * The angle is written to the --tilt property and applied by index.css.
 */
export function TiltButton({ children, className, magnitude = 3 }: TiltButtonProps)
{
    const [tilt, setTilt] = useState<number | null>(null);

    const onEnter = useCallback(() => setTilt(randomDeg(magnitude)), [magnitude]);
    const onLeave = useCallback(() => setTilt(null), []);

    const style = tilt === null ? undefined : ({ '--tilt': `${tilt}deg` } as CSSProperties);

    return (
        <div
            className={['button', className].filter(Boolean).join(' ')}
            style={style}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
        >
            {children}
        </div>
    );
}
