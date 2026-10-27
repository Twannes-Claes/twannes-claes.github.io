import type { CreatureSize, GameSystem, Preset } from '../types';

/*
 * Monster presets are stat blocks in Markdown, the way the SRD and Homebrewery write them, see
 * "Monster presets" in PLAN.md. The app reads the few numbers a token needs from the labelled
 * lines and shows the rest as it is written. Only the Markdown a stat block uses is understood:
 * headings, lines, lists, tables, rules, bold and italics.
 */

/** The 5e template, with every part a stat block has, filled with an average foe. */
const fifthEdition = `# Monster name
*Medium humanoid, neutral*

**Armor Class** 12
**Hit Points** 11 (2d8 + 2)
**Speed** 30 ft.

| STR | DEX | CON | INT | WIS | CHA |
| --- | --- | --- | --- | --- | --- |
| 10 (+0) | 12 (+1) | 12 (+1) | 10 (+0) | 10 (+0) | 10 (+0) |

**Saving Throws** Dex +3
**Skills** Perception +2, Stealth +3
**Senses** darkvision 60 ft., passive Perception 12
**Languages** Common
**Challenge** 1/4 (50 XP)

## Traits

**Trait name.** What it does.

## Actions

**Attack name.** *Melee Weapon Attack:* +3 to hit, reach 5 ft., one target. *Hit:* 4 (1d6 + 1) slashing damage.

## Reactions

**Reaction name.** When it happens, what it does.

## Legendary actions

**Action name.** What it does.
`;

/** What a new preset starts as, in the session's system. Other starts from 5e. */
export const statBlockTemplates: Record<GameSystem, string> = {
    '5e': fifthEdition,
    pf2e: `# Creature name
**Creature 1**
*Medium humanoid*

**Perception** +6; darkvision
**Languages** Common
**Skills** Athletics +5, Stealth +7
**Str** +2, **Dex** +3, **Con** +1, **Int** +0, **Wis** +1, **Cha** +0

---

**AC** 16; **Fort** +6, **Ref** +8, **Will** +5
**HP** 20
**Speed** 25 feet

---

**Melee** ◆ shortsword +8 (agile, finesse), **Damage** 1d6+3 piercing

**Ability name** ◆◆ What it does.

**Reaction name** ⤾ **Trigger** When it happens. **Effect** What it does.
`,
    other: fifthEdition,
};

/**
 * The ogre of the example session, a preset in a new host's library, see addExample in
 * convex/sessions.ts. Its numbers match demoOgre in content/scenarios.ts. From the SRD 5.1,
 * by Wizards of the Coast, under CC BY 4.0.
 */
export const demoOgreStatBlock = `# Ogre
*Large giant, chaotic evil*

**Armor Class** 11 (hide armor)
**Hit Points** 59 (7d10 + 21)
**Speed** 40 ft.

| STR | DEX | CON | INT | WIS | CHA |
| --- | --- | --- | --- | --- | --- |
| 19 (+4) | 8 (-1) | 16 (+3) | 5 (-3) | 7 (-2) | 7 (-2) |

**Senses** darkvision 60 ft., passive Perception 8
**Languages** Common, Giant
**Challenge** 2 (450 XP)

## Actions

**Greatclub.** *Melee Weapon Attack:* +6 to hit, reach 5 ft., one target. *Hit:* 13 (2d8 + 4) bludgeoning damage.

**Javelin.** *Melee or Ranged Weapon Attack:* +6 to hit, reach 5 ft. or range 30/120 ft., one target. *Hit:* 11 (2d6 + 4) piercing damage.
`;

/** The demo's own Ogre preset, kept in the tab, which its ogre on the map was placed from. */
export const demoOgrePreset: Preset = { id: 'ogre', name: 'Ogre', markdown: demoOgreStatBlock, downs: false, color: '#b4443c' };

/** A piece of a line, in bold or italics or both. */
export interface Span
{
    text: string;
    bold?: boolean;
    italic?: boolean;
}

/** A stretch of a stat block. Lines stay lines, as stat blocks put each label on its own. */
export type Block =
    | { kind: 'heading'; level: number; text: string }
    | { kind: 'lines'; lines: string[] }
    | { kind: 'list'; items: string[] }
    | { kind: 'table'; head: string[]; rows: string[][] }
    | { kind: 'rule' };

/** The numbers a stat block gives a token, those it has. */
export interface StatBlockStats
{
    name: string;
    size?: CreatureSize;
    ac?: number;
    maxHp?: number;
    speed?: number;
    /** Passive: as written in 5e, 10 and the modifier in Pathfinder 2e. */
    perception?: number;
}

/** The lines, without the > that Homebrewery puts before each line of a stat block. */
function linesOf(markdown: string): string[]
{
    return markdown.split(/\r?\n/).map((line) => line.replace(/^\s*>\s?/, '').trim());
}

/** A line as spans: ***both***, **bold**, *italic* or _italic_. */
export function spansOf(text: string): Span[]
{
    return text
        .split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/)
        .filter(Boolean)
        .map((part) =>
        {
            if (/^\*\*\*.+\*\*\*$/.test(part))
                return { text: part.slice(3, -3), bold: true, italic: true };

            if (/^\*\*.+\*\*$/.test(part))
                return { text: part.slice(2, -2), bold: true };

            return /^(\*.+\*|_.+_)$/.test(part) ? { text: part.slice(1, -1), italic: true } : { text: part };
        });
}

/** A line without its marks. */
const plain = (text: string) => spansOf(text).map((span) => span.text).join('');

/** A stat block as blocks to show, see components/StatBlock.tsx. */
export function blocksOf(markdown: string): Block[]
{
    const blocks: Block[] = [];
    // The block the next line adds to, until a blank line or another kind ends it.
    let open: Block | null = null;

    for (const line of linesOf(markdown))
    {
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        const item = /^[-*+]\s+(.*)$/.exec(line);
        const cells = line.startsWith('|') ? line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()) : null;

        if (!line)
            open = null;
        else if (heading)
        {
            blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
            open = null;
        }
        else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line))
        {
            blocks.push({ kind: 'rule' });
            open = null;
        }
        else if (cells)
        {
            // The row of dashes under the head is only Markdown's way of saying it is one.
            if (open?.kind !== 'table')
            {
                open = { kind: 'table', head: cells, rows: [] };
                blocks.push(open);
            }
            else if (!cells.every((cell) => /^:?-+:?$/.test(cell)))
                open.rows.push(cells);

        }
        else if (item)
        {
            if (open?.kind === 'list')
                open.items.push(item[1]);
            else
            {
                open = { kind: 'list', items: [item[1]] };
                blocks.push(open);
            }
        }
        else if (open?.kind === 'lines')
            open.lines.push(line);
        else
        {
            open = { kind: 'lines', lines: [line] };
            blocks.push(open);
        }
    }

    return blocks;
}

/** The number after a label at the start of a line, like **Armor Class** 15 or **AC:** 15. */
function labelled(text: string, labels: string): number | undefined
{
    const found = new RegExp(`^\\**\\s*(?:${labels})\\s*:?\\s*\\**\\s*:?\\s*([+-]?\\d+)`, 'im').exec(text);

    return found ? Number(found[1]) : undefined;
}

const sizePattern = /\b(tiny|small|medium|large|huge|gargantuan)\b/i;

/**
 * The name, from the first # heading, and the numbers a token takes, from the labels the SRD and
 * Pathfinder write: Armor Class or AC, Hit Points or HP, Speed, passive Perception or Perception.
 * The size is the first one named before the AC, where both put the creature's type.
 */
export function statsOf(markdown: string): StatBlockStats
{
    const lines = linesOf(markdown);
    const text = lines.join('\n');
    const top = lines.findIndex((line) => /^#\s/.test(line));
    const acAt = lines.findIndex((line) => labelled(line, 'Armor Class|AC') !== undefined);
    const intro = lines.slice(top + 1, acAt === -1 ? undefined : acAt);
    const size = intro.map((line) => sizePattern.exec(line)?.[1]).find(Boolean)?.toLowerCase();
    const passive = /passive Perception\s*:?\s*(\d+)/i.exec(text);
    const modifier = labelled(text, 'Perception');

    return {
        name: top === -1 ? '' : plain(lines[top].replace(/^#\s+/, '')).trim(),
        size: size as CreatureSize | undefined,
        ac: labelled(text, 'Armor Class|AC'),
        maxHp: labelled(text, 'Hit Points|HP'),
        speed: labelled(text, 'Speed'),
        perception: passive ? Number(passive[1]) : modifier === undefined ? undefined : 10 + modifier,
    };
}

/** A number as stat blocks print it, with the SRD's minus sign too. */
const signed = (text: string) => Number(text.replace('−', '-'));

/**
 * The Dexterity modifier: under DEX in the ability table, like 12 (+1), or worked out from the
 * score, also from a DEX line outside a table.
 */
function dexterityOf(lines: string[]): number | undefined
{
    const cellsOf = (line: string) => line.replace(/^\||\|$/g, '').split('|').map((cell) => plain(cell).trim());
    const head = lines.findIndex((line) => line.startsWith('|') && cellsOf(line).some((cell) => /^dex$/i.test(cell)));
    const row = head === -1 ? undefined : lines.slice(head + 1).find((line) => line.startsWith('|') && !/^[|\s:-]+$/.test(line));
    const cell = row && cellsOf(row)[cellsOf(lines[head]).findIndex((name) => /^dex$/i.test(name))];
    const found = cell ? /^(\d+)\s*(?:\(\s*([+−-]?\d+)\s*\))?/.exec(cell) : null;
    const score = found ? Number(found[1]) : labelled(lines.join('\n'), 'DEX|Dexterity');

    if (found?.[2] !== undefined)
        return signed(found[2]);

    return score === undefined ? undefined : Math.floor((score - 10) / 2);
}

/**
 * What a creature adds to its initiative roll, by the system's rules: Perception in Pathfinder
 * 2e, otherwise an Initiative line where the stat block has one, else the Dexterity modifier.
 */
export function initiativeOf(markdown: string, system: GameSystem): number | undefined
{
    const lines = linesOf(markdown);
    const text = lines.join('\n');

    if (system === 'pf2e')
        return labelled(text, 'Perception');

    return labelled(text, 'Initiative') ?? dexterityOf(lines);
}
