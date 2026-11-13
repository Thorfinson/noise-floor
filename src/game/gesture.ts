/**
 * Two hits on muted strings, one right after the other, and then nothing: the gesture that pauses a run and
 * starts it again without taking a hand off the guitar.
 *
 * The "then nothing" matters. Two muffed notes in the middle of a phrase are followed by more playing, and
 * must not stop the game. And the order of what the listener reports matters: it reports a hit on muted
 * strings late, once the strings have had time to fall silent, so the note played right after such a hit
 * is heard as struck before the hit itself is reported. Times are therefore always those of the events,
 * never those of their arrival.
 */
export class MuteGesture {
  /** the hit before, if it can still be the first of the two */
  private last = -9;
  private lastOnset = -9;
  private playedAt = -9;
  /** time of the second hit, while waiting to see that nothing is played after it */
  private armed = 0;

  /** Something was struck. */
  onset(time: number): void {
    this.lastOnset = Math.max(this.lastOnset, time);
    // the listener takes onsets less than a tenth of a second apart for one attack
    if (this.armed && time > this.armed + 0.1) this.armed = 0;
  }

  /** What was struck at this time turned out to be a note or a chord: that was playing. */
  played(time: number): void {
    this.playedAt = Math.max(this.playedAt, time);
    if (this.armed && time > this.armed + 0.1) this.armed = 0;
  }

  /**
   * Something sounded and was gone at once. `hit` says that it was struck: a hand laid on ringing strings
   * also ends in silence, and is not half of the gesture.
   */
  thud(time: number, hit: boolean): void {
    // a short note is a note
    if (!hit || Math.abs(time - this.playedAt) < 0.1) return;
    const before = this.last;
    this.last = time;
    const pair = time - before > 0.12 && time - before < 0.7;
    // a note between the two hits: that was playing, not the gesture
    const between = this.playedAt > before && this.playedAt < time;
    // and what was struck after the second hit has already been heard
    const after = this.lastOnset > time + 0.1 || this.playedAt > time + 0.1;
    if (pair && !between && !after) this.armed = time;
  }

  /** True once, when half a second has passed since the second hit and nothing was struck. */
  due(now: number): boolean {
    if (!this.armed || now - this.armed <= 0.5) return false;
    this.armed = 0;
    this.last = -9;
    return true;
  }
}
