<script lang="ts">
  /** One polite live region for both boards, rate-limited to one message a second per board. */
  let { text }: { text: string } = $props();
</script>

<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{text}</div>
