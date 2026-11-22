/* Spin-1/2 singlet and sequential projective measurements, without color inversion. */
(function (root) {
  'use strict';
  const ANGLES = Object.freeze([0,120,240]);
  const normalize = angle => ((angle % 360) + 360) % 360;
  function validateSetting(setting) {
    if (!Number.isInteger(setting) || setting < 1 || setting > 3) throw new RangeError('A setting must be 1, 2, or 3.');
  }
  function probabilityForAngle(particleAngle, setting) {
    if (!Number.isFinite(particleAngle)) throw new RangeError('A particle angle must be finite.');
    validateSetting(setting);
    const p = Math.cos((normalize(particleAngle)-ANGLES[setting-1])*Math.PI/360)**2;
    return p < 1e-12 ? 0 : p > 1-1e-12 ? 1 : p;
  }
  function sampleExperiment(detectors, rng = Math.random) {
    if (!Array.isArray(detectors)) throw new TypeError('Detectors must be an array.');
    const ids = new Set();
    const snapshot = detectors.map(d => {
      if (typeof d.id !== 'string' || !d.id || ids.has(d.id)) throw new RangeError('Detector identifiers must be unique nonempty strings.');
      ids.add(d.id);
      validateSetting(d.setting);
      if (!Number.isFinite(d.x) || d.x === 0) throw new RangeError('A detector must have a finite, nonzero position.');
      return Object.freeze({id:d.id,x:d.x,setting:d.setting});
    });
    // Equal speeds in the lab frame: distance from the source sets event order.
    // Exact distance ties use the identifier for a reproducible computational order.
    const ordered = [...snapshot].sort((a,b) => Math.abs(a.x)-Math.abs(b.x) || a.id.localeCompare(b.id));
    const spins = {left:null,right:null};
    const events = ordered.map((d,index) => {
      const side = d.x < 0 ? 'left' : 'right';
      const partner = side === 'left' ? 'right' : 'left';
      const previousAngle = spins[side];
      const probability = index === 0 ? .5 : probabilityForAngle(previousAngle,d.setting);
      const color = rng() < probability ? 'green' : 'red';
      const angle = normalize(ANGLES[d.setting-1] + (color === 'red' ? 180 : 0));
      spins[side] = angle;
      // Only the first detection collapses the entangled pair. All later
      // measurements affect just the particle passing through that detector.
      if (index === 0) spins[partner] = normalize(angle+180);
      return Object.freeze({...d,side,distance:Math.abs(d.x),previousAngle,probability,color,angle,collapsesPair:index===0});
    });
    return Object.freeze({detectors:Object.freeze(snapshot),events:Object.freeze(events),spins:Object.freeze(spins),firstDetector:events[0]?.id ?? null});
  }
  const model = Object.freeze({ANGLES,probabilityForAngle,sampleExperiment});
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  root.BellPhysics = model;
})(typeof globalThis !== 'undefined' ? globalThis : this);
