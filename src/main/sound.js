const store = require('./store');

/**
 * Sound Manager: handles sound notifications safely without harsh system buzzers
 */
class SoundManager {
  static playChime(type = 'start') {
    const settings = store.getSettings();
    if (settings.general?.quietMode) return;
    if (type.startsWith('video') && !settings.video?.audioBeep) return;

    // Sounds are synthesized directly in renderer via Web Audio API (AeroSoundSynth)
    // for pristine audio quality without console beeps.
  }
}

module.exports = SoundManager;
