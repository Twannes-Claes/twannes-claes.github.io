import type { Project, ProjectCategory } from '../types';

import { adaptaSolva } from './adapta-solva';
import { aiPlanes } from './ai-planes';
import { brothBrawlers } from './broth-brawlers';
import { cityCrawlers } from './city-crawlers';
import { componentEngine } from './component-engine';
import { dotsResearchGame } from './dots-research-game';
import { pepperRobot } from './pepper-robot';
import { physicsEngine } from './physics-engine';
import { replaceable } from './replaceable';
import { vintecc } from './vintecc';

/** Category order on the home page. Each name doubles as its group's heading. */
const CATEGORY_ORDER: ProjectCategory[] = ['Professional Work', 'Game Dev', 'Game Jams'];

/** Every project, including inactive ones. Add new projects here. */
export const allProjects: Project[] = [
    vintecc,
    replaceable,
    pepperRobot,
    adaptaSolva,
    physicsEngine,
    dotsResearchGame,
    brothBrawlers,
    aiPlanes,
    componentEngine,
    cityCrawlers,
].sort((a, b) => a.order - b.order);

export interface ProjectGroup
{
    category: ProjectCategory;
    projects: Project[];
}

/** Active projects grouped by category. Empty groups are dropped. */
export function getProjectGroups(): ProjectGroup[]
{
    return CATEGORY_ORDER.map((category) => ({
        category,
        projects: allProjects.filter((project) => project.active && project.category === category),
    })).filter((group) => group.projects.length > 0);
}
