import { faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Link } from 'react-router-dom';

import type { Project } from '../content/types';

import { TiltButton } from './TiltButton';

export function ProjectCard({ project }: { project: Project })
{
    return (
        <Link
            to={`/projects/${project.slug}`}
            className="group relative rounded-lg border-2 border-edge bg-bg p-6 transition-transform duration-300 hover:z-1 hover:scale-[1.025] max-[768px]:mx-2"
        >
            <div className="relative z-0">
                <div className="overflow-hidden">
                    <img
                        src={project.cardImage}
                        alt=""
                        className="aspect-[330/260] w-full object-cover object-center transition-all duration-300"
                    />
                </div>
                <div className="absolute top-0 left-0 z-1 flex flex-row flex-wrap gap-x-2 gap-y-1.5 p-3">
                    {project.tags.map((tag) => (
                        <span key={tag} className="tag">
                            {tag}
                        </span>
                    ))}
                </div>
            </div>

            <div className="mt-[14px] flex items-center justify-between gap-4">
                <h3 className="text-[22px] font-semibold tracking-[-0.01em] transition-colors duration-300 group-hover:text-accent">
                    {project.title}
                </h3>
                <TiltButton
                    className="button--icon shrink-0 translate-x-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-hover:delay-100"
                    magnitude={12}
                >
                    <span>
                        <FontAwesomeIcon icon={faArrowRight} />
                    </span>
                </TiltButton>
            </div>
        </Link>
    );
}
