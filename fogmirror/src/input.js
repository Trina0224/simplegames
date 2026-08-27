export class MirrorInput {
  constructor(canvas, field, droplets, gravityProvider = () => ({ x: 0, y: 1, plane: 1 })) {
    this.canvas=canvas; this.field=field; this.droplets=droplets;
    this.gravityProvider=gravityProvider;
    this.active=new Map();
    this.onWipe=null;
    this._down=e=>this._pointerDown(e);
    this._move=e=>this._pointerMove(e);
    this._up=e=>this._pointerUp(e);
    canvas.addEventListener('pointerdown',this._down);
    canvas.addEventListener('pointermove',this._move);
    canvas.addEventListener('pointerup',this._up);
    canvas.addEventListener('pointercancel',this._up);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
  }

  _pos(e){
    const r=this.canvas.getBoundingClientRect();
    return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
  }

  _pointerDown(e){
    e.preventDefault();
    const p=this._pos(e), now=performance.now();
    this.active.set(e.pointerId,{...p,t:now,lastNucleate:0});
    try{this.canvas.setPointerCapture(e.pointerId);}catch(_){}
    this.field.wipe(p.x,p.y,0.035,0,0,0);
  }

  _pointerMove(e){
    const prev=this.active.get(e.pointerId); if(!prev)return;
    e.preventDefault();
    const p=this._pos(e), now=performance.now();
    const dt=Math.max(.008,(now-prev.t)/1000);
    const dx=p.x-prev.x,dy=p.y-prev.y;
    const speed=Math.min(3,Math.hypot(dx,dy)/dt);
    const dist=Math.hypot(dx,dy);
    const steps=Math.max(1,Math.ceil(dist/.012));
    const ux=dx/(dist||1), uy=dy/(dist||1);

    const gravity=this.gravityProvider() || {x:0,y:1,plane:1};
    let gx=gravity.x, gy=gravity.y;
    const gm=Math.hypot(gx,gy);
    if(gm<.05){ gx=0; gy=1; }
    else { gx/=gm; gy/=gm; }

    for(let i=1;i<=steps;i++){
      const t=i/steps;
      const x=prev.x+dx*t,y=prev.y+dy*t;
      this.field.wipe(x,y,0.034,speed,ux,uy);
    }

    // Move the newly-created surface film to the physical downhill edge. This is
    // height-map transport, not particle spawning.
    this.field.squeezeWaterDownhill(
      p.x,
      p.y,
      gx,
      gy,
      Math.min(1.8,0.65+speed*.35),
      0.034*Math.min(1.45,1+speed*.14),
    );

    // Only occasionally ask for a macroscopic head. The water height map is free
    // to accumulate between these samples, so one basin grows a dominant collector
    // rather than a dotted necklace following every pointer event.
    const edge=0.031*Math.min(1.4,1+speed*.16);
    const canNucleate=(now-(prev.lastNucleate||0))>(speed>.9?150:220);
    if(canNucleate && dist>.006){
      const ex=Math.max(0,Math.min(1,p.x+gx*edge));
      const ey=Math.max(0,Math.min(1,p.y+gy*edge));
      this.droplets.nucleateAt(
        ex,
        ey,
        Math.min(1.45,.68+speed*.25),
        {x:ux*speed*.018,y:uy*speed*.018},
      );
      prev.lastNucleate=now;
    }

    // A decisive sweep supplies the same downhill basin rather than creating
    // several independent droplets along the stroke.
    if(speed>1.45 && dist>.035 && now-(prev.lastNucleate||0)>85){
      const ex=Math.max(0,Math.min(1,p.x+gx*.030+ux*.008));
      const ey=Math.max(0,Math.min(1,p.y+gy*.030+uy*.008));
      this.droplets.nucleateAt(
        ex,ey,
        Math.min(1.70,1.02+(speed-1.45)*.30),
        {x:ux*speed*.030,y:uy*speed*.030},
      );
      prev.lastNucleate=now;
    }

    this.active.set(e.pointerId,{...p,t:now,lastNucleate:prev.lastNucleate||0});
    if(this.onWipe)this.onWipe({x:p.x,y:p.y,speed});
  }

  _pointerUp(e){
    const prev=this.active.get(e.pointerId); if(!prev)return;
    this.active.delete(e.pointerId);
    try{this.canvas.releasePointerCapture(e.pointerId);}catch(_){}
  }
}
