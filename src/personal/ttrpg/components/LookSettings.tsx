import { RingPicker } from './RingPicker';
import { useLook } from './useLook';

/** This screen's look, see useLook.ts: in the gear and on the home page. */
export function LookSettings()
{
    const look = useLook();

    return (
        <>
            <section className="ttrpg-shortcuts" aria-label="Theme">
                <h3 className="ttrpg-subhead">Theme</h3>
                <div className="ttrpg-settings__choices">
                    <button type="button" className="ttrpg-segment" aria-pressed={look.theme === 'dark'} onClick={() => look.setTheme('dark')}>
                        Dark
                    </button>
                    <button type="button" className="ttrpg-segment" aria-pressed={look.theme === 'light'} onClick={() => look.setTheme('light')}>
                        Light
                    </button>
                </div>
            </section>
            <section className="ttrpg-shortcuts" aria-label="Accent colour">
                <h3 className="ttrpg-subhead">Accent colour</h3>
                <RingPicker value={look.accent} onChange={look.setAccent} label="Accent colour" />
            </section>
        </>
    );
}
