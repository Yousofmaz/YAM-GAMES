const SOUND_CONFIG = {
  src: './sounds/game-sound.mp3',
  loop: false, // اجعلها true إذا كان المقطع موسيقى/خلفية مستمرة
  volume: 0.8
};

class LocalGameAudio {
  constructor(config) {
    this.src = config.src;
    this.loop = Boolean(config.loop);
    this.volume = typeof config.volume === 'number' ? config.volume : 0.8;
    this.muted = false;
    this.unlocked = false;

    this.baseAudio = new Audio(this.src);
    this.baseAudio.preload = 'auto';
    this.baseAudio.loop = this.loop;
    this.baseAudio.volume = this.volume;

    this.bindUnlockOnFirstInteraction();
  }

  // يفتح قفل الصوت تلقائياً مع أول لمسة أو نقرة في الصفحة (مهم جداً للجوال والمتصفحات)
  bindUnlockOnFirstInteraction() {
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;

      this.baseAudio.muted = true;
      const promise = this.baseAudio.play();
      if (promise && typeof promise.then === 'function') {
        promise
          .then(() => {
            this.baseAudio.pause();
            this.baseAudio.currentTime = 0;
            this.baseAudio.muted = this.muted;
          })
          .catch(() => {
            this.baseAudio.muted = this.muted;
          });
      } else {
        this.baseAudio.muted = this.muted;
      }

      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  play() {
    if (this.muted) return;

    try {
      if (this.loop) {
        this.baseAudio.currentTime = 0;
        this.baseAudio.play().catch(() => {});
        return;
      }

      // تشغيل نسخة مستقلة للمقاطع القصيرة لتفادي أي تقطيع
      const clip = new Audio(this.src);
      clip.volume = this.volume;
      clip.play().catch(() => {});
    } catch (_) {
      // تجاهل أي خطأ بيئي في المتصفح
    }
  }

  stop() {
    this.baseAudio.pause();
    this.baseAudio.currentTime = 0;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    this.baseAudio.muted = this.muted;
    if (this.muted) {
      this.stop();
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }
}

const gameAudio = new LocalGameAudio(SOUND_CONFIG);