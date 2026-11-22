import UploadsDemo from 'docs-app/components/demos/uploads-demo'

<template>
  <h1>Actors</h1>
  <p>
    Every machine is an actor, and machines can own others. Each file in the queue below is its
    own <code>FileUpload</code> machine, spawned by the <code>Uploader</code>: it ticks its own
    progress, can be cancelled on its own, and reports back to its parent when it is done.
  </p>
  <ul>
    <li><code>this.spawn(child, &lbrace; id &rbrace;)</code> starts a child that lives until the parent stops.</li>
    <li>An <code>@invoke</code> method that returns a machine runs it while its state is active; when the child reaches a final state the parent takes <code>onDone</code>, with the child's <code>output</code> getter.</li>
    <li><code>this.sendTo(id, 'cancel')</code> and, from the child, <code>this.sendParent('finished', file)</code>.</li>
    <li><code>systemId</code> registers an actor for the whole tree: <code>this.system.get('uploader')</code>.</li>
    <li><code>this.emit(this.progress, &lbrace; file &rbrace;)</code> reaches outside listeners, <code>m.on(m.progress, fn)</code>.</li>
    <li><code>m.actors</code> lists the running children; diagrams draw the tree from it.</li>
  </ul>
  <UploadsDemo />
</template>
