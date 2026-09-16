// 上昇率を音で出す。実機のグライダーと同じ役割で、画面から目を離さずに芯を探すための唯一の手がかり。
export class Vario {
  constructor() { this.ctx = null; this.osc = null; this.gain = null; this.t = 0; this.on = false; }
  // iOSは最初のタップでしか鳴らせないので、開始ボタンから呼ぶ
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sine';
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.osc.connect(this.gain).connect(this.ctx.destination);
    this.osc.start();
    this.on = true;
  }
  stop() { if (this.gain) this.gain.gain.value = 0; this.on = false; }
  update(vz, dt) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (vz > 0.1) {
      // 上がっているほど高く、速く刻む
      const k = Math.min(1, vz / 5);
      const freq = 440 + 700 * k;
      const rate = 1.6 + 7.5 * k;
      this.t += dt * rate;
      const duty = this.t % 1 < 0.55 ? 1 : 0;
      this.osc.frequency.setTargetAtTime(freq, now, 0.02);
      this.gain.gain.setTargetAtTime(duty * 0.055, now, 0.012);
    } else if (vz < -2.2) {
      // 強く沈んでいるときだけ、低く伸ばして知らせる
      this.osc.frequency.setTargetAtTime(150, now, 0.05);
      this.gain.gain.setTargetAtTime(0.035, now, 0.05);
    } else {
      this.gain.gain.setTargetAtTime(0, now, 0.05);
    }
  }
}
