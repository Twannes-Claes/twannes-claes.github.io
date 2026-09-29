import '@fontsource-variable/onest';
import '@fontsource-variable/jetbrains-mono';

import { ViteReactSSG } from 'vite-react-ssg';

import { routes } from './routes';
import './styles/index.css';

export const createRoot = ViteReactSSG({ routes });
