/**
 * A buzz on phones that can, in milliseconds or a pattern of buzz and pause. Does nothing where
 * vibrate is missing, as in iOS Safari, or on a computer without the hardware.
 */
export function buzz(pattern: number | number[])
{
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator)
        navigator.vibrate(pattern);

}
