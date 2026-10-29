import test from 'node:test';import assert from 'node:assert/strict';
import {musicPlaybackVolume} from '../renderer/music-volume.js';
test('music ducks while speech buffers or plays, restores afterward and respects mute and volume changes',()=>{
 assert.equal(musicPlaybackVolume(0.5,null),0.5);
 assert.equal(musicPlaybackVolume(0.5,{state:'buffering'}),0.125);
 assert.equal(musicPlaybackVolume(0.5,{state:'playing'}),0.125);
 assert.equal(musicPlaybackVolume(0.8,{state:'playing'}),0.2);
 assert.equal(musicPlaybackVolume(0,{state:'playing'}),0);
 assert.equal(musicPlaybackVolume(0.8,null),0.8);
});
