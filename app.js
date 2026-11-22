/* Manual laboratory interactions. The independent spin model is in physics.js. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MIN_X=2.2, MAX_X=25.2, GAP=1.05, ROTATION_MS=190;
  const palette=['#e9b65d','#80baf4','#d09bee','#f092ad','#6bc9ba','#d9cc7b','#9faafa','#dc9d76','#96c28b','#9dcbd6'];
  const detectors=Array.from({length:10},(_,i)=>({id:String.fromCharCode(65+i),x:(i%2?1:-1)*(4+Math.floor(i/2)*4),setting:1,placed:false,randomize:false,baseColor:palette[i],color:null,flashAt:-Infinity}));
  const byId=Object.fromEntries(detectors.map(d=>[d.id,d]));
  const state={requested:0,released:0,last:null,sound:true};
  const pending=[];
  let preparation=null,lastEmission=-Infinity,unpaintedEmission=false,audio=null;
  let scene,camera,renderer,raycaster,sourceButton,previewGroup,previewMaterial,resizeObserver;
  let frame=0,lastFrame=0,pointer=null,drag=null,dragGhost=null;
  const home=()=>({yaw:.40,pitch:.52,distance:66,targetX:0,targetZ:0});
  let orbit=home();
  const visuals={},labels={},hitTargets=[],portMaterials=[],portLights=[];
  const view=$('viewport'),canvas=$('scene');
  const colorHex={green:0x59f59b,red:0xff424e};
  const icon='<svg class="detector-icon" viewBox="0 0 40 48" fill="none" aria-hidden="true"><ellipse cx="20" cy="18" rx="12" ry="14" stroke="currentColor" stroke-width="3"/><path d="M20 18V5M20 32V40M10 42H30" stroke="currentColor" stroke-width="3"/></svg>';
  for(const d of detectors){
    const card=document.createElement('section');
    card.id=`card-${d.id}`;card.className='detector-card';card.style.setProperty('--base-color',d.baseColor);card.setAttribute('aria-label',`Detector ${d.id}`);
    card.innerHTML=`<div class="detector-title" data-drag="${d.id}" title="Drag this detector onto either side of the rail">${icon}<strong>Detector ${d.id}</strong><button id="place-${d.id}" class="card-action">Place</button></div><div class="orientation-label"><span>Orientation</span><span id="angle-${d.id}">0°</span></div><div class="settings" role="group" aria-label="Detector ${d.id} orientation">${[1,2,3].map(n=>`<button class="setting" data-setting="${n}" aria-label="Detector ${d.id}: orientation ${n}, ${BellPhysics.ANGLES[n-1]} degrees" aria-pressed="${n===1}"><span class="direction">${['↑','↘','↙'][n-1]}</span>${n}</button>`).join('')}</div><label class="position-control">Position<span class="numeric-position"><input id="position-${d.id}" class="position-number" type="number" min="-${MAX_X}" max="${MAX_X}" step="0.1" value="${d.x}" aria-label="Detector ${d.id} position"><span class="position-unit">m</span></span></label><input id="distance-${d.id}" class="position-slider" type="range" min="-${MAX_X}" max="${MAX_X}" step="0.1" value="${d.x}" aria-label="Detector ${d.id} position slider"><label class="random-option"><input id="random-${d.id}" type="checkbox">Randomize orientation before firing</label>`;
    $('detector-controls').appendChild(card);
    $(`place-${d.id}`).addEventListener('click',()=>{if(!locked())placeDetector(d,!d.placed);});
    card.querySelectorAll('[data-setting]').forEach(button=>button.addEventListener('click',()=>setSetting(d,Number(button.dataset.setting))));
    $(`position-${d.id}`).addEventListener('change',event=>moveFromControl(d,Number(event.target.value)));
    $(`distance-${d.id}`).addEventListener('input',event=>moveFromControl(d,Number(event.target.value)));
    $(`random-${d.id}`).addEventListener('change',event=>{if(!locked())d.randomize=event.target.checked;});
    // The whole card is a drag surface, except the interactive controls. The
    // title/icon explicitly disables touch scrolling so mobile drags also work.
    card.addEventListener('pointerdown',event=>{
      if(locked()||event.button!==0||event.target.closest('button,input,label'))return;
      drag={id:d.id,origin:'card',pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,active:false,position:null};
      card.setPointerCapture(event.pointerId);event.preventDefault();
    });
  }
  function locked(){return preparation!==null;}
  function announce(text){$('announcement').textContent=text;}
  function freePosition(preferred,id){
    if(!Number.isFinite(preferred))return null;
    const sign=preferred<0?-1:1;
    const desired=sign*Math.max(MIN_X,Math.min(MAX_X,Math.abs(preferred)));
    const occupied=detectors.filter(d=>d.placed&&d.id!==id).map(d=>d.x);
    const legal=x=>occupied.every(other=>Math.abs(other-x)>=GAP-1e-8);
    const rounded=Math.round(desired*10)/10;
    if(legal(rounded))return rounded;
    let best=null,bestDistance=Infinity;
    for(let x=MIN_X;x<=MAX_X+.001;x+=.1){
      const candidate=sign*Math.round(x*10)/10;
      if(legal(candidate)&&Math.abs(candidate-desired)<bestDistance){best=candidate;bestDistance=Math.abs(candidate-desired);}
    }
    return best;
  }
  function moveFromControl(d,x){
    if(locked())return;
    const position=freePosition(x,d.id);
    if(position!==null)d.x=position;
    updateControls();syncScene();
  }
  function placeDetector(d,placed,position=d.x){
    if(placed){const available=freePosition(position,d.id);if(available===null){announce('No space at that position.');return;}d.x=available;}
    d.placed=placed;
    if(!placed){d.color=null;d.flashAt=-Infinity;}
    updateControls();syncScene();
  }
  function setSetting(d,setting){if(locked())return;d.setting=setting;updateControls();}
  function updateControls(){
    const disabled=locked();
    for(const d of detectors){
      const card=$(`card-${d.id}`);card.classList.toggle('placed',d.placed);card.classList.toggle('preparing',!!preparation?.randomIds.has(d.id));
      $(`place-${d.id}`).textContent=d.placed?'Remove':'Place';
      $(`place-${d.id}`).disabled=disabled;
      $(`angle-${d.id}`).textContent=`${BellPhysics.ANGLES[d.setting-1]}°`;
      for(const prefix of ['position','distance']){const input=$(`${prefix}-${d.id}`);input.value=d.x;input.disabled=disabled;}
      $(`random-${d.id}`).checked=d.randomize;$(`random-${d.id}`).disabled=disabled;
      card.querySelectorAll('[data-setting]').forEach(button=>{const active=Number(button.dataset.setting)===d.setting;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.disabled=disabled;});
    }
    $('place-all').disabled=disabled||detectors.every(d=>d.placed);
    $('scene-hint').textContent=detectors.some(d=>d.placed)?'Click a disc to turn it · Drag a detector to move it':'Drag a detector onto the rail';
    const count=pending.length+(preparation?1:0);$('queue-badge').hidden=count===0;$('queue-badge').textContent=count?`${count} queued`:'';
  }
  $('place-all').addEventListener('click',()=>{if(!locked())for(const d of detectors)if(!d.placed)placeDetector(d,true);});
  $('reset-view').addEventListener('click',()=>{orbit=home();updateCamera();});
  $('focus-source').addEventListener('click',()=>{orbit={...home(),distance:18};updateCamera();});
  $('sound').addEventListener('click',()=>{state.sound=!state.sound;$('sound').textContent=state.sound?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(state.sound));if(state.sound)ensureAudio();});
  function ensureAudio(){
    if(!state.sound)return;
    try{if(!audio){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio)audio=new Audio();}if(audio?.state==='suspended')audio.resume().catch(()=>{});}catch{/* Audio support is optional. */}
  }
  function releaseSound(){
    if(!state.sound||!audio||audio.state!=='running')return;
    try{
      const start=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
      osc.type='triangle';osc.frequency.setValueAtTime(750,start);osc.frequency.exponentialRampToValueAtTime(150,start+.045);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.075,start+.003);gain.gain.exponentialRampToValueAtTime(.0001,start+.052);
      osc.connect(gain);gain.connect(audio.destination);osc.start(start);osc.stop(start+.055);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }catch{/* Muting or an unavailable audio device never prevents a release. */}
  }
  function requestShot(){
    ensureAudio();state.requested++;
    // Each press captures its own arrangement. No shot is dropped while lamps
    // fade, or while a preceding randomized shot is preparing.
    pending.push(detectors.filter(d=>d.placed).map(d=>({id:d.id,x:d.x,setting:d.setting,randomize:d.randomize})));
    startNextShot(performance.now());updateControls();
  }
  function startNextShot(now){
    if(preparation)return;
    while(pending.length){
      const plan=pending.shift(),randomIds=new Set(plan.filter(d=>d.randomize).map(d=>d.id));
      if(randomIds.size){
        const rotations={};
        for(const entry of plan){
          if(entry.randomize)entry.setting=1+Math.floor(Math.random()*3);
          const d=byId[entry.id];d.setting=entry.setting;
          if(entry.randomize&&visuals[d.id]){
            const from=visuals[d.id].rotor.rotation.x;
            const target=-BellPhysics.ANGLES[d.setting-1]*Math.PI/180;
            // Uniform target choice includes the current setting. One full turn
            // makes even that case visibly randomize, without biasing the draw.
            const remaining=((from-target)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
            rotations[d.id]={from,to:from-2*Math.PI-remaining};
          }
        }
        preparation={plan,randomIds,rotations,start:now,deadline:now+ROTATION_MS};
        updateControls();return;
      }
      emit(plan,now);
    }
  }
  function emit(plan,now){
    const result=BellPhysics.sampleExperiment(plan);state.last=result;state.released++;lastEmission=now;unpaintedEmission=true;
    // Event order is resolved at equal particle speeds in the lab frame by the
    // pure model. All results are displayed in this same task: no slow flight.
    for(const event of result.events){const d=byId[event.id];if(d.placed){d.color=event.color;d.flashAt=now;d.unpaintedFlash=true;}}
    releaseSound();$('shot-count').value=String(state.released);
    const observations=[...result.events].sort((a,b)=>a.id.localeCompare(b.id));
    $('last-result').innerHTML=observations.length?observations.map(event=>`<span class="observation" style="--base-color:${byId[event.id].baseColor};--result-color:${event.color==='green'?'#64ef9c':'#ff5360'}"><b>${event.id}</b><i class="result-dot"></i><span class="color-name">${event.color==='green'?'Green':'Red'}</span></span>`).join(''):'<span class="muted">—</span>';
    $('last-result').dataset.order=result.events.map(e=>e.id).join(',');
  }
  function tickPreparation(now){
    if(!preparation){startNextShot(now);return;}
    const progress=Math.max(0,Math.min(1,(now-preparation.start)/ROTATION_MS)),eased=1-(1-progress)**3;
    for(const [id,rotation] of Object.entries(preparation.rotations)){
      visuals[id].rotor.rotation.x=reducedMotion?rotation.to:rotation.from+(rotation.to-rotation.from)*eased;
    }
    if(now>=preparation.deadline){
      const completed=preparation;
      for(const entry of completed.plan)if(visuals[entry.id])visuals[entry.id].rotor.rotation.x=-BellPhysics.ANGLES[entry.setting-1]*Math.PI/180;
      preparation=null;emit(completed.plan,now);startNextShot(now);updateControls();
    }
  }
  $('fire').addEventListener('click',requestShot);
  document.addEventListener('keydown',event=>{if(event.code==='Space'&&!event.repeat&&!event.target.closest('button,input,a,textarea,select')){event.preventDefault();requestShot();}});
  const material=(color,roughness=.5,metalness=.15)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  function box(w,h,d,mat,x,y,z,parent=scene){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  function cylinder(radius,height,mat,x,y,z,parent=scene){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,40),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  function textSprite(text,color='#a6c5c9'){
    const element=document.createElement('canvas');element.width=128;element.height=64;
    const ctx=element.getContext('2d');ctx.font=text.length>3?'500 18px system-ui':'500 34px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,64,32);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(element),transparent:true,depthWrite:false}));sprite.scale.set(.48,.24,1);return sprite;
  }
  function initScene(){
    scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x1b2932,.006);
    camera=new THREE.PerspectiveCamera(32,1,.1,300);
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
    raycaster=new THREE.Raycaster();scene.add(new THREE.HemisphereLight(0xcbe8ed,0x27333a,2));
    const key=new THREE.DirectionalLight(0xfff3df,3.2);key.position.set(-8,25,15);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-33,right:33,top:25,bottom:-25,near:.5,far:80});key.shadow.normalBias=.025;scene.add(key);
    const fill=new THREE.DirectionalLight(0x8ae4d8,1.2);fill.position.set(10,8,-12);scene.add(fill);
    const floor=box(300,.15,300,material(0x19272f,.95,0),0,-.26,0);floor.castShadow=false;
    const grid=new THREE.GridHelper(150,75,0x39505b,0x31454f);grid.position.y=-.175;grid.material.transparent=true;grid.material.opacity=.25;scene.add(grid);
    box(54.6,.22,3.1,material(0x263942,.8,.35),0,-.03,0);
    const metal=material(0x8ca2a9,.3,.8),dark=material(0x17282f,.5,.6),rail=material(0x647c86,.32,.85);
    for(const z of [-.47,.47]){
      box(51.6,.21,.19,rail,0,.7,z);box(51.6,.035,.22,metal,0,.82,z);
      for(let x=-24;x<=24;x+=4)box(.28,.62,.2,dark,x,.33,z);
    }
    const tickMaterial=material(0x88a1a9);
    for(let x=-25;x<=25;x+=.5)box(.028,.016,.19,tickMaterial,x,.84,.7);
    for(let x=-24;x<=24;x+=2){const t=textSprite(String(x));t.position.set(x,.1,1.22);t.scale.multiplyScalar(.9);scene.add(t);}
    const source=new THREE.Group();source.name='source';scene.add(source);
    box(2.02,1.48,1.6,material(0xc0ccc5,.4,.35),0,1.63,0,source);box(2.15,.18,1.72,metal,0,.84,0,source);box(2.1,.12,1.68,material(0xdce1d5,.3,.4),0,2.4,0,source);
    box(1.58,.65,.025,material(0x263a41),0,1.68,.815,source);
    for(let i=0;i<5;i++)box(.62,.035,.026,material(0x09171d),-.2,1.47+i*.1,.84,source);
    for(const x of [-.86,.86])for(const y of [1.08,2.15]){const screw=cylinder(.045,.018,metal,x,y,.82,source);screw.rotation.x=Math.PI/2;}
    for(const side of [-1,1]){
      const port=cylinder(.3,.14,material(0x0e1e25),side*1.06,1.92,0,source);port.rotation.z=Math.PI/2;
      const rimMat=new THREE.MeshStandardMaterial({color:0x78928d,emissive:0xffffff,emissiveIntensity:0,roughness:.3,metalness:.2,toneMapped:false});
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.31,.05,14,56),rimMat);ring.rotation.y=Math.PI/2;ring.position.set(side*1.15,1.92,0);ring.name=`emission-port-${side}`;source.add(ring);portMaterials.push(rimMat);
      const light=new THREE.PointLight(0xffffff,0,2.5,2);light.position.set(side*1.25,1.92,0);scene.add(light);portLights.push(light);
    }
    cylinder(.51,.11,dark,0,2.53,0,source);
    sourceButton=cylinder(.43,.19,material(0xf33240,.25,.25),0,2.67,0,source);sourceButton.name='release-button';sourceButton.userData={kind:'source'};hitTargets.push(sourceButton);
    const buttonRim=new THREE.Mesh(new THREE.TorusGeometry(.47,.025,12,64),metal);buttonRim.rotation.x=Math.PI/2;buttonRim.position.set(0,2.58,0);source.add(buttonRim);
    const badgeTexture=textSprite('SOURCE','#d7e2dc').material.map;const badge=new THREE.Mesh(new THREE.PlaneGeometry(1.3,.65),new THREE.MeshBasicMaterial({map:badgeTexture,transparent:true,depthWrite:false}));badge.position.set(0,1.92,.837);source.add(badge);
    const sourceLabel=document.createElement('div');sourceLabel.className='scene-label source-label';sourceLabel.innerHTML='<strong>SOURCE</strong>';$('labels').appendChild(sourceLabel);labels.source=sourceLabel;
    for(const d of detectors)createDetector(d);
    previewGroup=new THREE.Group();previewMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.5,depthWrite:false});
    const hoop=new THREE.Mesh(new THREE.TorusGeometry(.78,.035,8,48),previewMaterial);hoop.rotation.y=Math.PI/2;hoop.position.y=1.92;previewGroup.add(hoop);box(.7,.12,1.7,previewMaterial,0,.9,0,previewGroup);previewGroup.visible=false;scene.add(previewGroup);
    resize();resizeObserver=new ResizeObserver(resize);resizeObserver.observe(view);
  }
  function createDetector(d){
    const group=new THREE.Group();group.name=`detector-${d.id}`;scene.add(group);
    const body=material(d.baseColor,.4,.4),trim=material(0xb4c6bd,.3,.6),graphite=material(0x183039,.45,.4);
    box(.7,.25,1.6,body,0,.98,0,group);box(.82,.1,1.72,graphite,0,.83,0,group);
    for(const z of [-.56,.56])box(.23,.44,.18,trim,0,1.29,z,group);
    const bezel=new THREE.Mesh(new THREE.TorusGeometry(.76,.105,18,64),graphite);bezel.rotation.y=Math.PI/2;bezel.position.y=1.92;group.add(bezel);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.76,.054,16,64),trim);ring.rotation.y=Math.PI/2;ring.position.y=1.92;group.add(ring);
    const rotor=new THREE.Group();rotor.name="analyzer";rotor.position.y=1.92;group.add(rotor);
    // A continuous disc with a true internal slot: 0.22 m wide, slightly
    // narrower than the 0.30 m indicator LED, with solid material at both ends.
    const discShape=new THREE.Shape();discShape.absarc(0,0,.70,0,Math.PI*2,false);
    const slot=new THREE.Path();slot.moveTo(-.11,-.53);slot.lineTo(-.11,.53);slot.lineTo(.11,.53);slot.lineTo(.11,-.53);slot.closePath();discShape.holes.push(slot);
    const discGeometry=new THREE.ExtrudeGeometry(discShape,{depth:.085,bevelEnabled:false,curveSegments:48});
    const discMaterial=new THREE.MeshStandardMaterial({color:0x91a6a1,roughness:.6,metalness:.1,emissive:0x1d3a39,emissiveIntensity:.3});
    const disc=new THREE.Mesh(discGeometry,discMaterial);disc.name='slotted-disc';disc.rotation.y=Math.PI/2;disc.position.x=-.0425;disc.castShadow=true;disc.receiveShadow=true;rotor.add(disc);
    const markerMat=material(d.baseColor,.3,.35);box(.12,.22,.072,markerMat,0,.72,0,rotor);
    const arrow=new THREE.Mesh(new THREE.ConeGeometry(.09,.17,3),markerMat);arrow.position.set(0,.88,0);rotor.add(arrow);
    for(let n=0;n<3;n++){const angle=-BellPhysics.ANGLES[n]*Math.PI/180;const tick=box(.08,.10,.045,trim,0,1.92+Math.cos(angle)*.98,Math.sin(angle)*.98,group);tick.rotation.x=angle;}
    box(.25,.22,.32,graphite,0,2.94,0,group);
    const lampMat=new THREE.MeshStandardMaterial({color:0x354c4a,emissive:0x000000,roughness:.8,metalness:0,toneMapped:false});
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.15,24,16),lampMat);lamp.name="indicator";lamp.position.set(0,3.1,0);group.add(lamp);
    const light=new THREE.PointLight(0x59f59b,0,2.2,2);light.position.copy(lamp.position);group.add(light);
    const pickMaterial=new THREE.MeshBasicMaterial({visible:false});
    const target=new THREE.Mesh(new THREE.CylinderGeometry(1.16,1.16,.85,24),pickMaterial);target.rotation.z=Math.PI/2;target.position.y=1.92;target.userData={kind:'detector',id:d.id};group.add(target);hitTargets.push(target);
    const baseTarget=box(.95,.5,1.9,pickMaterial,0,1,0,group);baseTarget.userData={kind:'detector',id:d.id};hitTargets.push(baseTarget);
    const label=document.createElement('div');label.className='scene-label';label.style.setProperty('--base-color',d.baseColor);label.innerHTML=`<strong>${d.id}</strong>`;$('labels').appendChild(label);labels[d.id]=label;
    visuals[d.id]={group,rotor,lampMat,light};
  }
  function syncScene(){if(!renderer)return;for(const d of detectors){const v=visuals[d.id];v.group.visible=d.placed;v.group.position.x=d.x;labels[d.id].hidden=!d.placed;}}
  function resize(){if(!renderer)return;renderer.setSize(view.clientWidth,view.clientHeight,false);camera.aspect=view.clientWidth/view.clientHeight;camera.updateProjectionMatrix();updateCamera();}
  function updateCamera(){
    if(!camera)return;const distance=orbit.distance*Math.max(1,1.5/camera.aspect);
    camera.position.set(orbit.targetX+Math.sin(orbit.yaw)*Math.cos(orbit.pitch)*distance,1+Math.sin(orbit.pitch)*distance,orbit.targetZ+Math.cos(orbit.yaw)*Math.cos(orbit.pitch)*distance);
    camera.lookAt(orbit.targetX,1.05,orbit.targetZ);camera.updateMatrixWorld();
  }
  function pointerRay(x,y){if(!raycaster)return;const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),camera);}
  function hit(x,y){if(!renderer)return null;pointerRay(x,y);return raycaster.intersectObjects(hitTargets.filter(t=>t.userData.kind==='source'||byId[t.userData.id].placed),false)[0]?.object.userData;}
  function project(x,y,z=0){const v=new THREE.Vector3(x,y,z).project(camera);return {x:(v.x*.5+.5)*view.clientWidth,y:(-v.y*.5+.5)*view.clientHeight,z:v.z};}
  function dropPosition(x,y,id){
    if(!renderer)return null;const rect=canvas.getBoundingClientRect();if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return null;
    const px=x-rect.left,py=y-rect.top;let best=null,bestDistance=Infinity;
    // Accept the projected rail-to-ring segment, on either side, from any view.
    for(const side of [-1,1])for(let distance=MIN_X;distance<=MAX_X+.001;distance+=.1){
      const railX=side*distance,low=project(railX,.85),high=project(railX,2.9);if(low.z>1)continue;
      const dx=high.x-low.x,dy=high.y-low.y,t=Math.max(0,Math.min(1,((px-low.x)*dx+(py-low.y)*dy)/(dx*dx+dy*dy)));
      const separation=Math.hypot(px-low.x-t*dx,py-low.y-t*dy);
      if(separation<bestDistance){bestDistance=separation;best=railX;}
    }
    return bestDistance<=42?freePosition(best,id):null;
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0&&event.button!==2)return;
    const target=hit(event.clientX,event.clientY);
    pointer={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false,target,pan:event.shiftKey||event.button===2};
    if(target?.kind==='detector'&&!locked()&&!pointer.pan)drag={id:target.id,origin:'scene',pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,active:false,position:null};
    canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');
  });
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  window.addEventListener('pointermove',event=>{
    if(drag&&event.pointerId===drag.pointerId){
      if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>5)drag.active=true;
      if(drag.active){
        if(!dragGhost){dragGhost=document.createElement('div');dragGhost.id='drag-ghost';document.body.appendChild(dragGhost);}
        const d=byId[drag.id];drag.position=dropPosition(event.clientX,event.clientY,d.id);
        dragGhost.style.setProperty('--base-color',d.baseColor);dragGhost.textContent=`${d.id}${drag.position===null?'':` · ${drag.position.toFixed(1)} m`}`;
        dragGhost.style.left=`${event.clientX}px`;dragGhost.style.top=`${event.clientY}px`;
        if(previewGroup){previewGroup.visible=drag.position!==null;previewGroup.position.x=drag.position??0;previewMaterial.color.set(d.baseColor);}
      }
      return;
    }
    if(pointer){
      const dx=event.clientX-pointer.lastX,dy=event.clientY-pointer.lastY;
      if(Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>5)pointer.moved=true;
      if(pointer.moved){
        if(pointer.pan){const scale=orbit.distance/view.clientHeight*.4;orbit.targetX-=dx*scale*Math.cos(orbit.yaw);orbit.targetZ+=dx*scale*Math.sin(orbit.yaw)+dy*scale;}
        else{orbit.yaw-=dx*.006;orbit.pitch=Math.max(.15,Math.min(1.22,orbit.pitch+dy*.005));}
        updateCamera();
      }
      pointer.lastX=event.clientX;pointer.lastY=event.clientY;
    }else if(event.target===canvas)canvas.style.cursor=hit(event.clientX,event.clientY)?'pointer':'grab';
  });
  function clearDrag(){dragGhost?.remove();dragGhost=null;drag=null;pointer=null;if(previewGroup)previewGroup.visible=false;canvas.classList.remove('dragging');}
  window.addEventListener('pointerup',event=>{
    if(drag?.active){const position=dropPosition(event.clientX,event.clientY,drag.id);if(position!==null&&!locked())placeDetector(byId[drag.id],true,position);else announce('Drop the detector on either side of the rail.');}
    else if(pointer&&!pointer.moved&&!pointer.pan){if(pointer.target?.kind==='source')requestShot();else if(pointer.target?.kind==='detector'){const d=byId[pointer.target.id];setSetting(d,d.setting%3+1);}}
    clearDrag();syncScene();
  });
  window.addEventListener('pointercancel',clearDrag);
  window.addEventListener('blur',clearDrag);
  canvas.addEventListener('wheel',event=>{event.preventDefault();orbit.distance=Math.max(9,Math.min(100,orbit.distance*Math.exp(event.deltaY*.001)));updateCamera();},{passive:false});
  function positionLabel(element,x,y,z=0){const p=project(x,y,z);element.style.left=`${p.x}px`;element.style.top=`${p.y}px`;element.style.visibility=p.z<1&&p.x>=-15&&p.x<=view.clientWidth+15?'visible':'hidden';}
  function animate(now){
    frame=requestAnimationFrame(animate);tickPreparation(now);if(!renderer)return;
    const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
    for(const d of detectors){
      const v=visuals[d.id];
      if(!preparation?.rotations[d.id]){const target=-BellPhysics.ANGLES[d.setting-1]*Math.PI/180,delta=Math.atan2(Math.sin(target-v.rotor.rotation.x),Math.cos(target-v.rotor.rotation.x));v.rotor.rotation.x+=reducedMotion?delta:delta*Math.min(1,dt*24);}
      if(d.unpaintedFlash){d.flashAt=now;d.unpaintedFlash=false;}
      const brightness=Math.max(0,Math.min(1,1-(now-d.flashAt-170)/680));
      if(d.color&&brightness>0){v.lampMat.color.set(0x263d3b).lerp(new THREE.Color(colorHex[d.color]).multiplyScalar(.2),brightness);v.lampMat.emissive.set(colorHex[d.color]);v.lampMat.emissiveIntensity=brightness*.8;v.light.color.set(colorHex[d.color]);v.light.intensity=brightness*2.2;}
      else{v.lampMat.color.set(0x354c4a);v.lampMat.emissiveIntensity=0;v.light.intensity=0;}
      if(d.placed)positionLabel(labels[d.id],d.x,3.95);
    }
    if(unpaintedEmission){lastEmission=now;unpaintedEmission=false;}
    const age=Math.max(0,now-lastEmission),pulse=Math.max(0,Math.min(1,1-age/150));
    for(const mat of portMaterials){mat.color.set(0x78928d).lerp(new THREE.Color(0xffffff),pulse);mat.emissiveIntensity=pulse*2;}
    for(const light of portLights)light.intensity=pulse*3;
    sourceButton.position.y=2.67-(age<65?.055:0);
    positionLabel(labels.source,0,3.65);renderer.render(scene,camera);
  }
  try{initScene();syncScene();}catch(error){console.error('3D initialization failed:',error);$('scene-error').hidden=false;renderer?.dispose();renderer=null;}
  updateControls();frame=requestAnimationFrame(animate);
  window.addEventListener('pagehide',event=>{if(!event.persisted){cancelAnimationFrame(frame);resizeObserver?.disconnect();renderer?.dispose();audio?.close().catch(()=>{});}});
})();





