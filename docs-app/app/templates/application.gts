import { LinkTo } from '@ember/routing'
import { pages } from 'docs-app/router'

<template>
  <nav class="site-nav">
    <div class="container">
      <ul>
        <li class="brand">
          <a href="../" class="brand-link"><img src="./favicon.svg" alt="" width="28" height="28" /><strong>switchyard</strong></a>
        </li>
      </ul>
      <ul>
        <li><a href="../">Home</a></li>
        <li><a href="https://github.com/joegaudet/switchyard">GitHub</a></li>
      </ul>
    </div>
  </nav>
  <div class="container guide">
    <nav class="guide-nav" aria-label="Guide">
      <ul>
        {{#each pages as |group|}}
          <li class="group">{{group.title}}</li>
          {{#each group.items as |page|}}
            <li><LinkTo @route={{page.route}}>{{page.title}}</LinkTo></li>
          {{/each}}
        {{/each}}
      </ul>
    </nav>
    <main class="page">{{outlet}}</main>
  </div>
</template>
