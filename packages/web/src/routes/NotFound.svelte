<script lang="ts">
  import TopBar from '../components/TopBar.svelte';
  let { path = '' }: { path?: string } = $props();
</script>

<TopBar />
<main class="page">
  <h1>No such page</h1>
  <p class="muted">Nothing lives at <code>{path}</code>.</p>
  <p><a href="/">Set up a table</a> or read the <a href="/rules">rules</a>.</p>
</main>
