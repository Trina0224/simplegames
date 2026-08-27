export class MirrorInput {
  constructor(canvas, field, droplets) {
    this.canvas=canvas; this.field=field; this.droplets=droplets;
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

    for(let i=1;i<=steps;i++){
      const t=i/steps;
      const x=prev.x+dx*t,y=prev.y+dy*t;
      this.field.wipe(x,y,0.034,speed,ux,uy);
    }

    // Water pools at the wipe edge, not throughout the entire fogged surface.
    // Use the normal to the stroke so beads appear at the moisture ridge created
    // by the finger. Feed nearby existing beads instead of creating a field of dots.
    const nx=-uy, ny=ux;
    const edge=0.032*Math.min(1.45,1+speed*.18);
    const canNucleate=(now-(prev.lastNucleate||0))>(speed>.9?55:95);
    if(canNucleate && dist>.006){
      const side=(Math.sin(now*.013+e.pointerId)>0)?1:-1;
      const ex=Math.max(0,Math.min(1,p.x+nx*edge*side));
      const ey=Math.max(0,Math.min(1,p.y+ny*edge*side));
      this.droplets.nucleateAt(ex,ey,Math.min(1.25,.55+speed*.28),{x:ux*speed*.05,y:uy*speed*.05});
      prev.lastNucleate=now;
    }

    // A decisive sweep gathers water mainly at the leading end. It creates at
    // most one or two pools; those pools then collect and merge naturally.
    if(speed>1.25 && dist>.028){
      this.droplets.nucleateAt(
        Math.max(0,Math.min(1,p.x+ux*.012)),
        Math.max(0,Math.min(1,p.y+uy*.012)),
        Math.min(1.5,.8+(speed-1.25)*.35),
        {x:ux*speed*.10,y:uy*speed*.10},
      );
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
