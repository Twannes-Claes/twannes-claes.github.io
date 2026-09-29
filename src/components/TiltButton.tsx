import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';

/** Picks -magnitude or +magnitude, like the old button-tilt.js. */
function randomDeg(magnitude: number): number {
  return Math.random() < 0.5 ? -magnitude : magnitude;
}

interface TiltButtonProps {
  children: ReactNode;
  /** Extra modifiers, e.g. 'button--icon' or 'button--back'. */
  className?: string;
  /** Rotation in degrees. 3 for full-size buttons, 12 for the icon-only ones. */
  magnitude?: number;
}

/**
 * Wraps a link or span in the site's button chrome and tilts it by a random
 * angle on hover. The angle is published as the --tilt custom property and
 * applied by the .button rules in index.css.
 */
export function TiltButton({ children, className, magnitude = 3 }: TiltButtonProps) {
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
