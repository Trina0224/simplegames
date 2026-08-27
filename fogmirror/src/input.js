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

    for(let i=1;i<=steps;i++){
      const t=i/steps;
      const x=prev.x+dx*t,y=prev.y+dy*t;
      this.field.wipe(x,y,0.034,speed,ux,uy);
    }

    // Water squeezed by the fingertip accumulates on the physical *downhill*
    // edge of the contact patch. Do not alternate left/right sides of the stroke:
    // a real wet mirror cares about gravity, not stroke normal.
    const gravity=this.gravityProvider() || {x:0,y:1,plane:1};
    let gx=gravity.x, gy=gravity.y;
    const gm=Math.hypot(gx,gy);
    if(gm<.05){ gx=0; gy=1; }
    else { gx/=gm; gy/=gm; }

    const edge=0.031*Math.min(1.4,1+speed*.16);
    const canNucleate=(now-(prev.lastNucleate||0))>(speed>.9?95:145);
    if(canNucleate && dist>.006){
      const ex=Math.max(0,Math.min(1,p.x+gx*edge));
      const ey=Math.max(0,Math.min(1,p.y+gy*edge));
      this.droplets.nucleateAt(ex,ey,Math.min(1.35,.60+speed*.26),{x:ux*speed*.028,y:uy*speed*.028});
      prev.lastNucleate=now;
    }

    // A broad fast sweep piles extra water at a point slightly downhill *and*
    // ahead of the finger. This should feed the same dominant pool whenever it
    // is nearby, not spawn a necklace of droplets along the whole gesture.
    if(speed>1.30 && dist>.030){
      const ex=Math.max(0,Math.min(1,p.x+gx*.026+ux*.010));
      const ey=Math.max(0,Math.min(1,p.y+gy*.026+uy*.010));
      this.droplets.nucleateAt(
        ex,ey,
        Math.min(1.65,.95+(speed-1.30)*.32),
        {x:ux*speed*.045,y:uy*speed*.045},
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
