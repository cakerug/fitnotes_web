import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import appCss from '../styles.css?url'
import { hasWorkingDbFn } from '../server/functions/dashboard'

export const Route = createRootRoute({
  loader: async () => ({ hasWorkingDb: await hasWorkingDbFn() }),
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'FitNotes Editor',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { hasWorkingDb } = Route.useLoaderData()

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <nav className="flex gap-4 border-b border-gray-200 p-4 text-sm">
          <Link to="/" className="[&.active]:font-bold">
            Home
          </Link>
          {hasWorkingDb ? (
            <>
              <Link to="/exercises" className="[&.active]:font-bold">
                Exercises
              </Link>
              <Link to="/routines" className="[&.active]:font-bold">
                Routines
              </Link>
              <Link to="/export" className="[&.active]:font-bold">
                Export
              </Link>
            </>
          ) : (
            <>
              <span className="cursor-not-allowed text-gray-400" title="Import a backup before this page is available">
                Exercises
              </span>
              <span className="cursor-not-allowed text-gray-400" title="Import a backup before this page is available">
                Routines
              </span>
              <span className="cursor-not-allowed text-gray-400" title="Import a backup before this page is available">
                Export
              </span>
            </>
          )}
        </nav>
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
