import { fileSize } from '../services/images';

/** File storage on Convex's free plan, the room every map, token and prop shares. */
const storageBudget = 1024 ** 3;

interface StorageMeterProps
{
    propBytes: number;
    /** Every other stored file: maps, token pictures, and other hosts' props. */
    otherBytes: number;
    /** A bar of the whole plan, on the dashboard, rather than of what is used, in the props panel. */
    plan?: boolean;
}

/**
 * How much storage the props take beside everything else, as a bar with a legend. In the props
 * panel the bar is what is used, so the props' share shows; on the dashboard it is the whole plan,
 * so the room left shows. Both read the same, a name with the amount beside it. The other files only show when there are any, so the demo, which stores
 * nothing, shows just the props in the tab.
 */
export function StorageMeter({ propBytes, otherBytes, plan = false }: StorageMeterProps)
{
    const used = propBytes + otherBytes;
    const whole = plan ? storageBudget : Math.max(used, 1);
    const share = (bytes: number) => `${Math.min(100, (bytes / whole) * 100)}%`;

    return (
        <div className="ttrpg-storage">
            <p className="ttrpg-storage__head">
                Storage
                <span>{plan ? `${fileSize(used)} of ${fileSize(storageBudget)}` : `${fileSize(used)} used`}</span>
            </p>
            <div className="ttrpg-storage__bar" aria-hidden="true">
                {propBytes > 0 && <span className="ttrpg-storage__props" style={{ width: share(propBytes) }} />}
                {otherBytes > 0 && <span style={{ width: share(otherBytes) }} />}
            </div>
            <ul className="ttrpg-storage__legend">
                <li className="ttrpg-storage__props">{`Props ${fileSize(propBytes)}`}</li>
                {otherBytes > 0 && <li>{`Maps and tokens ${fileSize(otherBytes)}`}</li>}
            </ul>
        </div>
    );
}
