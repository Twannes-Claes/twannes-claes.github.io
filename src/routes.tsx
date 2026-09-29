import type { RouteRecord } from 'vite-react-ssg';

import { allProjects } from './content/projects';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import { ProjectPage } from './pages/ProjectPage';

/**
 * One concrete route per project rather than a `projects/:slug` dynamic route.
 *
 * vite-react-ssg prerenders every static route automatically, so this avoids
 * having to hand it a getStaticPaths list and guarantees each project ends up as
 * a real HTML file.
 */
export const routes: RouteRecord[] = [
  {
    path: '/',
    element: <Home />,
    entry: 'src/pages/Home.tsx',
  },
  ...allProjects.map((project): RouteRecord => ({
    path: `/projects/${project.slug}`,
    element: <ProjectPage slug={project.slug} />,
    entry: 'src/pages/ProjectPage.tsx',
  })),
  // Prerendered so the build can emit GitHub Pages' 404.html. The catch-all
  // below handles it client-side; this one makes it a real static file.
  {
    path: '/404',
    element: <NotFound />,
    entry: 'src/pages/NotFound.tsx',
  },
  {
    path: '*',
    element: <NotFound />,
    entry: 'src/pages/NotFound.tsx',
  },
];
