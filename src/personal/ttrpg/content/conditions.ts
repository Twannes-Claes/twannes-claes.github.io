import {
    faAnchor,
    faBackward,
    faBan,
    faBandage,
    faBatteryHalf,
    faBatteryQuarter,
    faBed,
    faBolt,
    faBrain,
    faCircleQuestion,
    faCloud,
    faCrosshairs,
    faDroplet,
    faDumbbell,
    faEarDeaf,
    faEyeLowVision,
    faEyeSlash,
    faFaceDizzy,
    faFire,
    faFlask,
    faForward,
    faGamepad,
    faGhost,
    faHand,
    faHeart,
    faHeartPulse,
    faHourglassEnd,
    faLink,
    faMountain,
    faPersonFalling,
    faPersonFallingBurst,
    faPersonRunning,
    faShuffle,
    faStar,
    faSun,
    faUserSecret,
    faVirus,
    type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';

import type { Condition, GameSystem } from '../types';

/** A condition a token can have, see Conditions in PLAN.md. max is set for one with a value. */
export interface ConditionKind
{
    id: string;
    name: string;
    icon: IconDefinition;
    max?: number;
}

/** The highest value Pathfinder's conditions take at a real table, past Dying's 4. */
const pf2eMax = 9;

const dnd5e: ConditionKind[] = [
    { id: 'blinded', name: 'Blinded', icon: faEyeSlash },
    { id: 'charmed', name: 'Charmed', icon: faHeart },
    { id: 'deafened', name: 'Deafened', icon: faEarDeaf },
    { id: 'exhaustion', name: 'Exhaustion', icon: faBatteryQuarter, max: 6 },
    { id: 'frightened', name: 'Frightened', icon: faGhost },
    { id: 'grappled', name: 'Grappled', icon: faHand },
    { id: 'incapacitated', name: 'Incapacitated', icon: faBan },
    { id: 'invisible', name: 'Invisible', icon: faUserSecret },
    { id: 'paralyzed', name: 'Paralyzed', icon: faBolt },
    { id: 'petrified', name: 'Petrified', icon: faMountain },
    { id: 'poisoned', name: 'Poisoned', icon: faFlask },
    { id: 'prone', name: 'Prone', icon: faPersonFalling },
    { id: 'restrained', name: 'Restrained', icon: faLink },
    { id: 'stunned', name: 'Stunned', icon: faFaceDizzy },
    { id: 'unconscious', name: 'Unconscious', icon: faBed },
];

// Observed, Unnoticed and Encumbered are left out: nothing to show on a map.
const pf2e: ConditionKind[] = [
    { id: 'blinded', name: 'Blinded', icon: faEyeSlash },
    { id: 'clumsy', name: 'Clumsy', icon: faPersonFallingBurst, max: pf2eMax },
    { id: 'concealed', name: 'Concealed', icon: faCloud },
    { id: 'confused', name: 'Confused', icon: faShuffle },
    { id: 'controlled', name: 'Controlled', icon: faGamepad },
    { id: 'dazzled', name: 'Dazzled', icon: faSun },
    { id: 'deafened', name: 'Deafened', icon: faEarDeaf },
    { id: 'doomed', name: 'Doomed', icon: faHourglassEnd, max: pf2eMax },
    { id: 'drained', name: 'Drained', icon: faDroplet, max: pf2eMax },
    { id: 'dying', name: 'Dying', icon: faHeartPulse, max: 4 },
    { id: 'enfeebled', name: 'Enfeebled', icon: faDumbbell, max: pf2eMax },
    { id: 'fascinated', name: 'Fascinated', icon: faStar },
    { id: 'fatigued', name: 'Fatigued', icon: faBatteryHalf },
    { id: 'fleeing', name: 'Fleeing', icon: faPersonRunning },
    { id: 'frightened', name: 'Frightened', icon: faGhost, max: pf2eMax },
    { id: 'grabbed', name: 'Grabbed', icon: faHand },
    { id: 'hidden', name: 'Hidden', icon: faEyeLowVision },
    { id: 'immobilized', name: 'Immobilized', icon: faAnchor },
    { id: 'invisible', name: 'Invisible', icon: faUserSecret },
    { id: 'off-guard', name: 'Off-guard', icon: faCrosshairs },
    { id: 'paralyzed', name: 'Paralyzed', icon: faBolt },
    { id: 'persistent', name: 'Persistent damage', icon: faFire },
    { id: 'petrified', name: 'Petrified', icon: faMountain },
    { id: 'prone', name: 'Prone', icon: faPersonFalling },
    { id: 'quickened', name: 'Quickened', icon: faForward },
    { id: 'restrained', name: 'Restrained', icon: faLink },
    { id: 'sickened', name: 'Sickened', icon: faVirus, max: pf2eMax },
    { id: 'slowed', name: 'Slowed', icon: faBackward, max: pf2eMax },
    { id: 'stunned', name: 'Stunned', icon: faFaceDizzy, max: pf2eMax },
    { id: 'stupefied', name: 'Stupefied', icon: faBrain, max: pf2eMax },
    { id: 'unconscious', name: 'Unconscious', icon: faBed },
    { id: 'undetected', name: 'Undetected', icon: faCircleQuestion },
    { id: 'wounded', name: 'Wounded', icon: faBandage, max: pf2eMax },
];

/** The conditions of a system, in the order the picker lists them. Other plays as 5e. */
export function conditionsOf(system: GameSystem): ConditionKind[]
{
    return system === 'pf2e' ? pf2e : dnd5e;
}

const everyKind = new Map([...dnd5e, ...pf2e].map((kind) => [kind.id, kind]));

/**
 * Any condition by its id, from either list, so a token keeps showing what it has after the GM
 * switches the system. A shared id, like Frightened, shows the same either way.
 */
export function conditionKind(id: string): ConditionKind | undefined
{
    return everyKind.get(id);
}

/**
 * Conditions as sent, kept to the system's list: each once, in the list's order, a value only on
 * one that takes it, whole and between 1 and its max. One that takes a value starts at 1.
 */
export function cleanConditions(system: GameSystem, conditions: Condition[]): Condition[]
{
    return conditionsOf(system).flatMap(({ id, max }) =>
    {
        const sent = conditions.find((condition) => condition.id === id);

        if (!sent)
            return [];

        if (max === undefined)
            return [{ id }];

        const value = Math.round(sent.value ?? 1);

        return [{ id, value: Number.isFinite(value) ? Math.min(max, Math.max(1, value)) : 1 }];
    });
}
