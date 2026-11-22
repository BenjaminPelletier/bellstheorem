'use strict';
const assert=require('node:assert/strict');
const {ANGLES,probabilityForAngle,sampleExperiment}=require('../physics.js');
function sequence(...values){return()=>{assert.ok(values.length,'Unexpected RNG draw');return values.shift();};}
const d=(id,x,setting=1)=>({id,x,setting});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);
assert.deepEqual(ANGLES,[0,120,240]);
for(let setting=1;setting<=3;setting++){
  assert.equal(probabilityForAngle(ANGLES[setting-1],setting),1);
  assert.equal(probabilityForAngle(ANGLES[setting-1]+180,setting),0);
}
close(probabilityForAngle(0,2),.25);close(probabilityForAngle(180,2),.75);
close(probabilityForAngle(360,2),probabilityForAngle(-360,2));
// Both colors, both possible first-particle sides, and all nine setting pairs.
for(const firstSide of [-1,1])for(let a=1;a<=3;a++)for(let b=1;b<=3;b++){
  const arrangement=[d('A',firstSide*2,a),d('B',-firstSide*4,b)];
  const counts={gg:0,gr:0,rg:0,rr:0};
  for(const u of [.125,.375,.625,.875])for(const v of [.125,.375,.625,.875]){
    const result=sampleExperiment(arrangement,sequence(u,v));
    assert.equal(result.firstDetector,'A');
    const [first,second]=result.events;
    assert.equal(first.color,u<.5?'green':'red');
    if(a===b)assert.notEqual(first.color,second.color,'Opposite particles must have opposite colors on equal axes');
    counts[first.color[0]+second.color[0]]++;
    assert.equal(result.events.filter(e=>e.collapsesPair).length,1);
    assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.events)&&Object.isFrozen(first)&&Object.isFrozen(result.spins));
  }
  assert.deepEqual(counts,a===b?{gg:0,gr:8,rg:8,rr:0}:{gg:6,gr:2,rg:2,rr:6});
  assert.equal(counts.gg+counts.gr,8);assert.equal(counts.gg+counts.rg,8);
}
// First event is whichever particle reaches a detector first in the lab frame.
let result=sampleExperiment([d('A',-10),d('J',2,2)],sequence(.1,.1));
assert.equal(result.firstDetector,'J');assert.deepEqual(result.events.map(e=>e.id),['J','A']);
result=sampleExperiment([d('B',3),d('A',-3)],sequence(.1,.5));assert.equal(result.firstDetector,'A');
// Only the first measurement sets the partner; later measurements cannot reset it.
result=sampleExperiment([d('E',-5,2),d('C',3,1),d('B',-2,2),d('D',4,2),d('A',-1,1)],sequence(.1,.1,.1,.8,.7));
assert.deepEqual(result.events.map(e=>e.id),['A','B','C','D','E']);
assert.deepEqual(result.events.map(e=>e.color),['green','green','red','red','green']);
assert.deepEqual(result.events.map(e=>e.previousAngle),[null,0,180,180,120]);
assert.deepEqual(result.spins,{left:120,right:300});
assert.equal(result.events[2].probability,0);assert.equal(result.events[4].probability,1);
// Repeated settings on one particle agree; an intervening setting can erase that.
result=sampleExperiment([d('A',-1),d('B',-2),d('C',-3)],sequence(.7,.1,.9));assert.deepEqual(result.events.map(e=>e.color),['red','red','red']);
result=sampleExperiment([d('A',-1),d('B',-2,2),d('C',-3)],sequence(.1,.1,.5));assert.deepEqual(result.events.map(e=>e.color),['green','green','red']);
const ten=Array.from({length:10},(_,i)=>d(String.fromCharCode(65+i),-(i+1)*2));
result=sampleExperiment(ten,()=>.1);assert.equal(result.events.length,10);assert.ok(result.events.every(e=>e.color==='green'));
assert.equal(result.spins.right,180);
const empty=sampleExperiment([],()=>{throw Error('Empty experiment drew randomness');});assert.deepEqual(empty.events,[]);assert.equal(empty.firstDetector,null);
const input=[d('A',-2)];const snapshot=sampleExperiment(input,sequence(.1));input[0].setting=2;assert.equal(snapshot.detectors[0].setting,1);
for(const invalid of [0,4,-1,1.5,NaN,'1'])assert.throws(()=>sampleExperiment([d('A',-2,invalid)]),RangeError);
for(const invalid of [0,Infinity,NaN,'2'])assert.throws(()=>sampleExperiment([d('A',invalid)]),RangeError);
assert.throws(()=>sampleExperiment([d('A',2),d('A',3)]),RangeError);
assert.throws(()=>probabilityForAngle(Infinity,1),RangeError);
assert.throws(()=>sampleExperiment(null),TypeError);
console.log('PASS: unflipped singlet statistics in all nine settings and both first-particle orders; nearest-detector ordering; exactly one pair collapse; independent subsequent measurements; repeatability and erasure; ten detectors on one side; missing detectors; immutable snapshots and validation.');
