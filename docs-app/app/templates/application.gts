import { LinkTo } from '@ember/routing'
import { pages } from 'docs-app/router'

/** On phones the contents start collapsed, so the page isn't pushed below the fold. */
const WIDE = typeof matchMedia === 'function' && matchMedia('(min-width: 861px)').matches

<template>
  <header class="guide-header">
    <a class="guide-brand" href="../">
      <img src="./favicon.svg" alt="" width="26" height="26" />
      <strong>switchyard</strong>
      <span class="guide-tag">Guide</span>
    </a>
    <nav aria-label="Site">
      <a href="../">Home</a>
      <LinkTo @route="demos">Demos</LinkTo>
      <a href="https://github.com/joegaudet/switchyard">GitHub</a>
    </nav>
  </header>

  <div class="guide-layout">
    <details class="guide-sidebar" open={{WIDE}}>
      <summary>Contents</summary>
      <nav aria-label="Guide">
        <ul>
          {{#each pages as |group|}}
            <li>
              {{group.title}}
              <ul>
                {{#each group.items as |page|}}
                  <li><LinkTo @route={{page.route}}>{{page.title}}</LinkTo></li>
                {{/each}}
              </ul>
            </li>
          {{/each}}
        </ul>
      </nav>
    </details>

    <main class="guide-main page">{{outlet}}</main>
  </div>

  <footer class="guide-footer">
    More open source from
    <a href="https://joegaudet.com/">Joe Gaudet</a>:
    <a href="https://joegaudet.com/harnessed/">harnessed</a>
    ·
    <a href="https://joegaudet.com/real-enums/">real-enums</a>
    ·
    <a href="https://joegaudet.com/ember-formwright/">Formwright</a>
    ·
    <a href="https://joegaudet.com/ember-joinery/">Joinery</a>
    ·
    <a href="https://joegaudet.com/switchyard/" aria-current="page">switchyard</a>
  </footer>
</template>
