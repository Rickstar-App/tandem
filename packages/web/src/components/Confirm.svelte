<script lang="ts">
  /** Destructive controls need a second confirming click within 5 s (BRIEF §5.4). */
  let { label, confirmLabel, onConfirm, disabled = false, danger = true }: {
    label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean; danger?: boolean;
  } = $props();

  let armed = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function click() {
    if (!armed) {
      armed = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { armed = false; }, 5000);
      return;
    }
    if (timer) clearTimeout(timer);
    armed = false;
    onConfirm();
  }

  $effect(() => () => { if (timer) clearTimeout(timer); });
</script>

<button
  class="quiet"
  class:danger
  data-armed={armed}
  {disabled}
  onclick={click}
  onblur={() => { armed = false; }}
>
  {armed ? confirmLabel : label}
</button>
