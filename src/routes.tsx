import type { RouteRecord } from 'vite-react-ssg';

import { Layout } from './components/Layout';
import { allProjects } from './content/projects';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import { ProjectPage } from './pages/ProjectPage';

/**
 * One concrete route per project instead of a `projects/:slug` dynamic route.
 * vite-react-ssg prerenders static routes automatically, so every project
 * becomes a real HTML file with no extra configuration.
 */
export const routes: RouteRecord[] = [
    {
        path: '/',
        element: <Layout />,
        entry: 'src/components/Layout.tsx',
        children: [
            {
                index: true,
                element: <Home />,
                entry: 'src/pages/Home.tsx',
            },
            ...allProjects.map((project): RouteRecord => ({
                path: `projects/${project.slug}`,
                element: <ProjectPage project={project} />,
                entry: 'src/pages/ProjectPage.tsx',
            })),
            // Prerendered so the build emits a real 404.html for GitHub Pages.
            {
                path: '404',
                element: <NotFound />,
                entry: 'src/pages/NotFound.tsx',
            },
            // Catches anything else on the client.
            {
                path: '*',
                element: <NotFound />,
                entry: 'src/pages/NotFound.tsx',
            },
        ],
    },
];
