import type { CSSProperties } from 'react';

/** Fixed positions rather than random ones, so the prerendered HTML matches the client render. */
const clouds = [
    { top: '12%', duration: 95, delay: -20, scale: 1 },
    { top: '30%', duration: 130, delay: -80, scale: 1.4 },
    { top: '55%', duration: 110, delay: -45, scale: 0.8 },
    { top: '72%', duration: 150, delay: -120, scale: 1.7 },
];

const sparks = Array.from({ length: 14 }, (_, index) => ({
    left: `${(index * 37 + 11) % 100}%`,
    duration: 9 + ((index * 7) % 8),
    delay: -((index * 13) % 17),
    sway: `${((index % 5) - 2) * 25}px`,
}));

/** The Skylands dusk behind the page: stars, drifting clouds and rising magic sparks. */
export function SkyBackdrop()
{
    return (
        <div className="sky-backdrop" aria-hidden="true">
            <div className="sky-stars" />
            <div className="sky-stars sky-stars--far" />
            {clouds.map((cloud) => (
                <div
                    key={cloud.top}
                    className="sky-cloud"
                    style={{
                        top: cloud.top,
                        scale: cloud.scale,
                        animationDuration: `${cloud.duration}s`,
                        animationDelay: `${cloud.delay}s`,
                    }}
                />
            ))}
            {sparks.map((spark) => (
                <span
                    key={spark.left}
                    className="sky-spark"
                    style={
                        {
                            left: spark.left,
                            animationDuration: `${spark.duration}s`,
                            animationDelay: `${spark.delay}s`,
                            '--sway': spark.sway,
                        } as CSSProperties
                    }
                />
            ))}
        </div>
    );
}
