<script lang="ts">
  import { linkHandler, parse, type Route } from './lib/router.ts';
  import Home from './routes/Home.svelte';
  import Table from './routes/Table.svelte';
  import Replay from './routes/Replay.svelte';
  import Rules from './routes/Rules.svelte';
  import NotFound from './routes/NotFound.svelte';

  let route = $state<Route>(parse(location.pathname));

  $effect(() => {
    const onPop = () => { route = parse(location.pathname); };
    addEventListener('popstate', onPop);
    addEventListener('click', linkHandler);
    return () => { removeEventListener('popstate', onPop); removeEventListener('click', linkHandler); };
  });

  // The title names the route so browser history and screen readers stay legible.
  $effect(() => {
    const t = route.name === 'home' ? 'Tandem — bughouse where you play both boards'
      : route.name === 'rules' ? 'Rules — Tandem'
      : route.name === 'table' ? `Table ${route.id} — Tandem`
      : route.name === 'replay' ? `Replay ${route.id} — Tandem`
      : route.name === 'watch' ? `Watching ${route.id} — Tandem`
      : 'Not found — Tandem';
    document.title = t;
  });
</script>

{#if route.name === 'home'}
  <Home />
{:else if route.name === 'rules'}
  <Rules />
{:else if route.name === 'table'}
  {#key route.id}<Table id={route.id} />{/key}
{:else if route.name === 'watch'}
  {#key route.id}<Table id={route.id} spectate />{/key}
{:else if route.name === 'replay'}
  {#key route.id}<Replay id={route.id} />{/key}
{:else}
  <NotFound path={route.path} />
{/if}
