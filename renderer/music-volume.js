export function musicPlaybackVolume(volume, currentSpeech) {
  return volume * (['buffering','playing'].includes(currentSpeech?.state) ? 0.25 : 1);
}
