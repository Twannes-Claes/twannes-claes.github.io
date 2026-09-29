import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Fragment } from 'react';

import { Nav } from '../components/Nav';
import { ProjectGallery } from '../components/ProjectGallery';
import { Seo } from '../components/Seo';
import { TiltButton } from '../components/TiltButton';
import { getProjectBySlug } from '../content/projects';
import { site } from '../content/site';

import NotFound from './NotFound';

export function ProjectPage({ slug }: { slug: string }) {
  const project = getProjectBySlug(slug);

  if (!project) return <NotFound />;

  const description = project.tags.join(', ');

  return (
    <>
      <Seo
        title={`${project.title} | ${site.author}`}
        description={`${project.title} - ${description}`}
        image={`${site.url}${project.cardImage}`}
        url={`${site.url}/projects/${project.slug}`}
        type="article"
      />
      <Nav back />

      <main className="container-page">
        <div className="my-[clamp(4rem,2.5vw+2.5rem,6.25rem)] grid grid-cols-2 max-[768px]:grid-cols-1 max-[768px]:gap-12">
          <div className="h-fit pe-[5%] max-[768px]:pe-0">
            <h1 className="mb-4 text-[clamp(1.5rem,2vw+1rem,2.75rem)]">{project.title}</h1>

            <div className="relative mb-14 flex w-fit flex-row flex-wrap gap-2">
              {project.tags.map((tag) => (
                <div key={tag} className="tag">
                  {tag}
                </div>
              ))}
            </div>

            <div className="rich-text mb-14">
              {/* Fragments so .tag--label:first-child zeroes the leading margin
                  on the first label only, as it did in the original markup. */}
              {project.sections.map((section) => (
                <Fragment key={section.label}>
                  <span className="tag tag--label">{section.label}</span>
                  {section.body}
                  {section.list && (
                    <ul className="prose-list">
                      {section.list.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  )}
                </Fragment>
              ))}
            </div>

            {project.links && project.links.length > 0 && (
              <div className="mt-14 flex flex-row flex-wrap gap-6">
                {project.links.map((link) => (
                  <TiltButton key={link.url}>
                    <a href={link.url} target="_blank" rel="noreferrer">
                      <FontAwesomeIcon icon={link.icon} />
                      {link.text}
                    </a>
                  </TiltButton>
                ))}
              </div>
            )}
          </div>

          {project.images && project.images.length > 0 && (
            <ProjectGallery images={project.images} />
          )}
        </div>
      </main>
    </>
  );
}
