(() => {
  if (window.__authSmokeController) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const entries = new Map();
  const videoUrl = '/assets/login-smoke-ambient.mp4';
  const posterUrl = '/assets/login-smoke-ambient.png';

  const toggleClass = (node, name, value) => {
    if (node.classList.contains(name) !== value) node.classList.toggle(name, value);
  };

  const isVisible = (backdrop) => {
    if (document.hidden || !backdrop.isConnected || backdrop.hidden) return false;
    const backdropStyle = window.getComputedStyle(backdrop);
    if (backdropStyle.display === 'none' || backdropStyle.visibility === 'hidden') return false;
    const overlay = backdrop.closest('.screen-lock-overlay');
    if (overlay && overlay.getAttribute('aria-hidden') !== 'false') return false;
    const host = overlay || backdrop.closest('.login');
    if (!host) return false;
    // The decorative backdrop itself is aria-hidden; only its hosts govern play.
    for (let node = host; node && node !== document; node = node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };

  const fail = (entry) => {
    if (entry.failed) return;
    entry.failed = true;
    entry.active = false;
    entry.generation += 1;
    entry.video?.pause();
    toggleClass(entry.backdrop, 'video-ready', false);
    toggleClass(entry.backdrop, 'video-fallback', true);
  };

  const createVideo = (entry) => {
    const video = document.createElement('video');
    video.className = 'auth-smoke-video';
    video.setAttribute('aria-hidden', 'true');
    video.setAttribute('tabindex', '-1');
    video.autoplay = true;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.preload = 'metadata';
    video.poster = posterUrl;
    video.addEventListener('error', () => fail(entry));
    video.addEventListener('playing', () => {
      if (!entry.active || motion.matches || document.hidden || entry.failed) {
        video.pause();
        return;
      }
      toggleClass(entry.backdrop, 'video-ready', true);
    });
    entry.video = video;
    entry.backdrop.prepend(video);
    video.src = videoUrl;
    return video;
  };

  const synchronize = (entry) => {
    const active = !entry.failed && !motion.matches && isVisible(entry.backdrop);
    if (active === entry.active) return;
    entry.active = active;
    const generation = ++entry.generation;
    if (!active) {
      entry.video?.pause();
      return;
    }
    const video = entry.video || createVideo(entry);
    try {
      const playing = video.play();
      if (playing && typeof playing.catch === 'function') playing.catch(() => {
        // A pause caused by hiding the PIN or changing the preference can reject
        // a pending play promise; that is not a broken video or autoplay policy.
        if (entry.active && entry.generation === generation) fail(entry);
      });
    } catch (_) {
      if (entry.active && entry.generation === generation) fail(entry);
    }
  };

  const refresh = () => {
    for (const [backdrop, entry] of entries) {
      if (!backdrop.isConnected) {
        entry.active = false;
        entry.generation += 1;
        entry.video?.pause();
        entries.delete(backdrop);
        entry.video?.remove();
      }
    }
    document.querySelectorAll('.auth-smoke-backdrop').forEach((backdrop) => {
      if (!entries.has(backdrop)) entries.set(backdrop, {
        backdrop, video: null, active: false, failed: false, generation: 0
      });
      synchronize(entries.get(backdrop));
    });
  };

  // Writes are guarded and playback only changes on state transitions. Observing
  // the added video and the readiness class therefore cannot feed a write loop.
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['aria-hidden', 'hidden', 'class', 'style']
  });
  document.addEventListener('visibilitychange', refresh);
  if (motion.addEventListener) motion.addEventListener('change', refresh);
  else motion.addListener?.(refresh);
  window.__authSmokeController = { refresh };
  refresh();
})();
