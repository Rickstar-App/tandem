<script lang="ts">
  let { subtitle = '' }: { subtitle?: string } = $props();
</script>

<header class="topbar">
  <a class="wordmark" href="/">Tandem</a>
  <div class="right">
    {#if subtitle}<span class="small muted sub">{subtitle}</span>{/if}
    <nav><a href="/rules">Rules</a></nav>
  </div>
</header>

<style>
  .right { display: flex; align-items: baseline; gap: var(--s-4); min-width: 0; }
  .sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* On a phone every pixel here is a pixel the boards do not get. */
  @media (max-width: 599px) {
    :global(.topbar) { padding: var(--s-2) var(--s-3); }
    :global(.topbar .wordmark) { font-size: 1.25rem; }
    .sub { max-width: 12ch; }
  }
</style>
