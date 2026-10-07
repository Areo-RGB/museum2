let apiPromise;

/** Load the official API only when a visitor selects a film. Failed loads can retry. */
export function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previous = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => fail(), 20000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      window.onYouTubeIframeAPIReady = previous;
      apiPromise = null;
      reject(new Error('YouTube could not connect. Select the film to retry.'));
    }
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      previous?.();
      resolve(window.YT);
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = fail;
    document.head.append(script);
  });
  return apiPromise;
}

export function youtubeEmbedURL(videoId, origin) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('Invalid YouTube video ID');
  const url = new URL(`https://www.youtube.com/embed/${videoId}`);
  url.search = new URLSearchParams({ enablejsapi: '1', playsinline: '1', origin, rel: '0' });
  return url.href;
}

/** DOM playback stays separate from WebGL; YouTube does not expose video textures. */
export class YouTubeFilm {
  constructor(videoId, container, onChange) {
    this.paused = true;
    this.disposed = false;
    this.volume = 0.8;
    this.status = 'Connecting to YouTube…';
    this.onChange = onChange;
    this.iframe = document.createElement('iframe');
    this.iframe.title = 'Cinema YouTube player';
    this.iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    this.iframe.allowFullscreen = true;
    this.iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    this.iframe.src = youtubeEmbedURL(videoId, location.origin);
    container.replaceChildren(this.iframe);
    this.ready = this.initialize();
  }

  async initialize() {
    const YT = await loadYouTubeAPI();
    if (this.disposed) return;
    await new Promise((resolve, reject) => {
      this.rejectReady = reject;
      this.timer = setTimeout(() => reject(new Error('YouTube did not respond. Select the film to retry.')), 20000);
      this.player = new YT.Player(this.iframe, { events: {
        onReady: () => {
          clearTimeout(this.timer);
          if (this.disposed) return;
          this.isReady = true;
          this.player.setVolume(this.volume * 100);
          this.status = 'Press Play on the video if playback does not start.';
          resolve();
          this.onChange();
        },
        onStateChange: ({ data }) => {
          if (this.disposed) return;
          this.paused = data !== 1 && data !== 3;
          this.status = data === 1 ? 'Playing on YouTube' : data === 0 ? 'Film finished' : data === 3 ? 'Buffering…' : 'Paused · press Play to watch';
          this.onChange();
        },
        onAutoplayBlocked: () => {
          if (this.disposed) return;
          this.status = 'Tap Play on the video to begin with sound.';
          this.onChange();
        },
        onError: ({ data }) => {
          if (this.disposed) return;
          clearTimeout(this.timer);
          this.paused = true;
          this.status = [101, 150].includes(data) ? 'The owner has disabled embedding. Open this film on YouTube.' : `YouTube playback error (${data}). Try again or open on YouTube.`;
          reject(new Error(this.status));
          this.onChange();
        },
      } });
    });
  }

  get progress() {
    const duration = this.isReady ? (this.player?.getDuration?.() ?? 0) : 0;
    return duration > 0 ? (this.player.getCurrentTime() / duration) : 0;
  }
  async play() { if (!this.disposed && this.isReady) this.player?.playVideo?.(); }
  pause() { if (this.isReady) this.player?.pauseVideo?.(); }
  setVolume(value) { this.volume = value; if (this.isReady) this.player?.setVolume?.(value * 100); }
  update() {}
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.rejectReady?.(new Error('Playback cancelled'));
    this.player?.destroy?.();
    this.iframe.remove();
  }
}
