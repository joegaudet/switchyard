import EditorDemo from 'docs-app/components/demos/editor-demo'

<template>
  <h1>Parallel regions</h1>
  <p>
    When independent things change independently, give each a region. A machine with
    <code>@region</code> fields is parallel at the top: every region is active at once, each with
    its own enum, and <code>m.state</code> is a record of them.
  </p>
  <pre><code class="language-typescript">class Formatting extends Machine&lt;&lbrace; bold: Toggle; italic: Toggle; align: Align &rbrace;&gt; &lbrace;
  @region(Toggle) accessor bold!: Toggle   // Ember: @region(Toggle) declare bold: Toggle
  @region(Toggle) accessor italic!: Toggle
  @region(Align) accessor align!: Align

  @transition(&lbrace; in: 'bold', from: Toggle.Off, to: Toggle.On &rbrace;)
  @transition(&lbrace; in: 'bold', from: Toggle.On, to: Toggle.Off &rbrace;)
  toggleBold() &lbrace;&rbrace;
&rbrace;</code></pre>
  <p>
    Two regions share the <code>Toggle</code> enum, so their transitions say which one with
    <code>in</code>. For the same reason, ask the region (<code>m.bold.isOn</code>)
    rather than <code>m.matches(Toggle.On)</code>, which is true if either is on.
  </p>
  <h2>Regions inside a state</h2>
  <p>
    Regions can also live inside one state of a larger machine:
    <code>static Editing = Doc.of('editing', &lbrace; regions: &lbrace; bold: Toggle, italic: Toggle &rbrace; &rbrace;)</code>,
    in <code>class Doc extends State&lt;Toggle&gt;</code>.
    Both regions run while <code>editing</code> is active; their transitions name the region by
    its path, <code>&lbrace; in: 'editing.bold' &rbrace;</code>.
  </p>
  <EditorDemo />
</template>
