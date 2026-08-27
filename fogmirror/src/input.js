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
    this.active.set(e.pointerId,{...p,t:now});
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
    for(let i=1;i<=steps;i++){
      const t=i/steps;
      const x=prev.x+dx*t,y=prev.y+dy*t;
      this.field.wipe(x,y,0.034,speed,dx/(dist||1),dy/(dist||1));
    }
    if(speed>.65 && dist>.018){
      this.droplets.seed(p.x,p.y,Math.min(2.2,.6+speed*.55),Math.min(.075,.025+speed*.018),{x:dx/dt*.10,y:dy/dt*.10});
    }
    this.active.set(e.pointerId,{...p,t:now});
    if(this.onWipe)this.onWipe({x:p.x,y:p.y,speed});
  }

  _pointerUp(e){
    const prev=this.active.get(e.pointerId); if(!prev)return;
    this.active.delete(e.pointerId);
    try{this.canvas.releasePointerCapture(e.pointerId);}catch(_){}
  }
}
