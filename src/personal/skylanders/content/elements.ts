import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
    faBolt,
    faDroplet,
    faFire,
    faGear,
    faGem,
    faHandFist,
    faLeaf,
    faMoon,
    faMountain,
    faSkull,
    faStar,
    faSun,
    faWandSparkles,
    faWind,
} from '@fortawesome/free-solid-svg-icons';

import type { ItemKind } from '../types';

export interface Element
{
    name: string;
    /** Drives the card glow, the medallion and the filter chip. */
    color: string;
    icon: IconDefinition;
}

/** In the order the games list them, which is also the order of the filter chips. */
export const elements: Element[] = [
    { name: 'Magic', color: '#b05cf0', icon: faWandSparkles },
    { name: 'Tech', color: '#f39a1f', icon: faGear },
    { name: 'Water', color: '#2f93f0', icon: faDroplet },
    { name: 'Fire', color: '#f0472d', icon: faFire },
    { name: 'Earth', color: '#b07a3c', icon: faMountain },
    { name: 'Air', color: '#7fd8f7', icon: faWind },
    { name: 'Life', color: '#63c93c', icon: faLeaf },
    { name: 'Undead', color: '#9aa0bd', icon: faSkull },
    { name: 'Light', color: '#ffd84a', icon: faSun },
    { name: 'Dark', color: '#6b53a3', icon: faMoon },
    { name: 'Kaos', color: '#e0369a', icon: faBolt },
];

/** For figures the wiki gives no element, gold like the rest of the frame. */
export const unknownElement: Element = { name: '', color: '#f5c542', icon: faStar };

/**
 * Giants are a size class, not an element, and still have an element of their own. They get a
 * tag and a filter chip that look like an element's.
 */
export const giant: Element = { name: 'Giants', color: '#5ee0b0', icon: faHandFist };

/**
 * Magic items and adventure packs have no element. They share one copper look instead, with a
 * tag and a filter chip like an element's.
 */
export const magicItem: Element = { name: 'Items', color: '#e07b53', icon: faGem };

/** The element's look, or the items' one for a magic item or adventure pack. */
export function elementFor(name: string, item?: ItemKind): Element
{
    if (item)
        return magicItem;

    return elements.find((element) => element.name === name) ?? unknownElement;
}
