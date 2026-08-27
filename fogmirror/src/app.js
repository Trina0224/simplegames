import { MirrorCamera } from './camera.js';
import { GravitySensor } from './orientation.js';
import { CondensationField } from './condensation.js';
import { DropletSystem } from './droplets.js';
import { MirrorRenderer } from './render.js';
import { MirrorInput } from './input.js';

const canvas=document.getElementById('mirror');
const video=document.getElementById('camera');
const startCard=document.getElementById('startCard');
const startBtn=document.getElementById('startBtn');
const steamBtn=document.getElementById('steamBtn');
const cameraBtn=document.getElementById('cameraBtn');
const motionBtn=document.getElementById('motionBtn');
const homeBtn=document.getElementById('homeBtn');
const statusEl=document.getElementById('status');

const camera=new MirrorCamera(video);
const gravity=new GravitySensor();
const field=new CondensationField(190,190);
const droplets=new DropletSystem(field);
const renderer=new MirrorRenderer(canvas,video,field,droplets);
const input=new MirrorInput(canvas,field,droplets);

let running=true;
let last=performance.now();
let statusTimer=null;
let started=false;

function status(text,ms=2400){
  statusEl.textContent=text;
  statusEl.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer=setTimeout(()=>statusEl.classList.remove('show'),ms);
}

function resize(){
  renderer.resize(innerWidth,innerHeight,devicePixelRatio||1);
}
addEventListener('resize',resize,{passive:true});
resize();

function syncButtons(){
  cameraBtn.classList.toggle('on',camera.enabled);
  cameraBtn.textContent=camera.enabled?'Camera on':'Camera';
  motionBtn.classList.toggle('on',gravity.enabled);
  motionBtn.textContent=gravity.enabled?'Gravity on':'Gravity';
}

async function startExperience(){
  if(started)return;
  started=true;
  // Both permission-gated requests are initiated from this tap.
  const cameraPromise=camera.start();
  const gravityPromise=gravity.start();
  startCard.classList.add('hidden');
  const [cam,motion]=await Promise.all([cameraPromise,gravityPromise]);
  syncButtons();
  if(cam&&motion) status('Mirror + physical gravity ready');
  else if(cam) status('Camera ready · gravity uses screen-down fallback');
  else if(motion) status('Gravity ready · camera unavailable, using fallback mirror');
  else status('Camera/motion unavailable · touch simulation still works');
}

startBtn.addEventListener('click',startExperience);

steamBtn.addEventListener('click',()=>{
  field.steam(1.35);
  // Fresh steam contributes liquid, especially where the glass is already wet.
  for(let i=0;i<10;i++){
    const x=.08+Math.random()*.84,y=.08+Math.random()*.75;
    if(field.sampleWet(x,y)>.12 || Math.random()<.26) droplets.seed(x,y,.45,.018);
  }
  status('Steam spreading across the mirror',1300);
});

cameraBtn.addEventListener('click',async()=>{
  if(camera.enabled){camera.stop();syncButtons();status('Camera off');return;}
  const ok=await camera.start();syncButtons();status(ok?'Camera on':'Camera permission unavailable');
});

motionBtn.addEventListener('click',async()=>{
  if(gravity.enabled){gravity.stop();syncButtons();status('Gravity sensor off · screen-down fallback');return;}
  const ok=await gravity.start();syncButtons();status(ok?'Physical gravity on':'Motion permission unavailable');
});

homeBtn.addEventListener('click',()=>{ location.href='../'; });

input.onWipe=({speed})=>{
  if(speed>1.4 && Math.random()<.18) status('Water released',700);
};

function frame(now){
  if(!running)return;
  const dt=Math.min(.05,Math.max(0,(now-last)/1000));
  last=now;
  field.update(dt);
  droplets.update(dt,gravity.vector());
  renderer.render(camera.enabled);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    camera.stop();
    syncButtons();
    last=performance.now();
  }
});

addEventListener('pagehide',()=>{
  running=false;
  camera.stop();
  gravity.stop();
});

// A few pinned beads make the first frame read as condensation rather than a filter.
for(let i=0;i<28;i++) droplets.add({
  x:.05+Math.random()*.9,
  y:.06+Math.random()*.82,
  radius:.003+Math.random()*.0065,
});

window.fogMirror={camera,gravity,field,droplets,renderer};
