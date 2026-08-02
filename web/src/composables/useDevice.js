import { ref, onMounted, onUnmounted } from 'vue';

const MOBILE_BREAKPOINT = 768; // px，小于此宽度视为移动端

export function useDevice() {
  const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT);
  function update() {
    isMobile.value = window.innerWidth < MOBILE_BREAKPOINT;
  }
  onMounted(() => window.addEventListener('resize', update));
  onUnmounted(() => window.removeEventListener('resize', update));
  return { isMobile };
}
