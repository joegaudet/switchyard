import EmberRouter from '@embroider/router'
import config from 'docs-app/config/environment'

declare global {
  interface Window {
    Prism?: { highlightAll(): void }
  }
}

export default class Router extends EmberRouter {
  location = config.locationType
  rootURL = config.rootURL

  constructor(...args: ConstructorParameters<typeof EmberRouter>) {
    super(...args)
    // Pages render their code after load; highlight once each page is on screen.
    this.on('routeDidChange', () => requestAnimationFrame(() => window.Prism?.highlightAll()))
  }
}

const group = (title: string, ...items: [route: string, title: string][]) => ({
  title,
  items: items.map(([route, label]) => ({ route, title: label })),
})

export const pages = [
  group('Start', ['index', 'Getting started']),
  group(
    'The model',
    ['states', 'States'],
    ['events', 'Events and guards'],
    ['parallel', 'Parallel regions'],
    ['async', 'Time and async work'],
    ['actors', 'Actors'],
    ['persistence', 'Persistence'],
  ),
  group(
    'Using it',
    ['ember', 'In Ember'],
    ['accessibility', 'Accessibility'],
    ['diagrams', 'Diagrams'],
    ['testing', 'Testing'],
    ['interop', 'xstate and SCXML'],
  ),
  group('More', ['demos', 'Demos'], ['compare', 'Compared'], ['migrate', 'Migrating']),
]

Router.map(function () {
  for (const g of pages) for (const { route } of g.items) if (route !== 'index') this.route(route)
})
