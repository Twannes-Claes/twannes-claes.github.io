import type { Project, ProjectCategory } from '../types';
import { PROJECT_CATEGORIES } from '../types';

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

/**
 * Every project in the repo, including inactive ones.
 *
 * Inactive projects keep their page (the old Jekyll collection also rendered
 * them) but are left out of the home page listing.
 */
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

/** Projects shown on the home page, ordered. */
export const activeProjects: Project[] = allProjects.filter((project) => project.active);

export function getProjectBySlug(slug: string | undefined): Project | undefined {
  return allProjects.find((project) => project.slug === slug);
}

export interface ProjectGroup {
  category: ProjectCategory;
  projects: Project[];
}

/**
 * Active projects grouped by category, in display order. Empty groups are
 * dropped, matching the old `{% if professional_work.size > 0 %}` guards.
 */
export function getProjectGroups(): ProjectGroup[] {
  return PROJECT_CATEGORIES.map((category) => ({
    category,
    projects: activeProjects.filter((project) => project.category === category),
  })).filter((group) => group.projects.length > 0);
}
