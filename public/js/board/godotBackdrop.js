import { reducedMotion } from '../juice.js';

export function backdropPhase(values) {
  const night=Math.max(0,Math.min(0.86,Number(values?.night)||0));
  return night<=0.25?night/0.25*0.52:0.52+(night-0.25)/0.61*0.48;
}
/** Décor non interactif : les commandes, le réseau, le micro et les joueurs restent ceux du jeu. */
export class GodotBackdrop {
  constructor(board) {
    this.board=board;this.phase=0;this.enabled=false;
    this.sunset=document.createElement('img');this.sunset.className='remaster-sunset';
    this.sunset.src='/assets/decor/remaster-sunset.png';this.sunset.alt='';this.sunset.draggable=false;
    board.stage.querySelector('.scenery').appendChild(this.sunset);
    this.canvas=document.createElement('iframe');this.canvas.id='meute-village-canvas';this.canvas.className='godot-backdrop';
    this.canvas.setAttribute('aria-hidden','true');this.canvas.setAttribute('title','Décor du village');
    this.canvas.setAttribute('sandbox','allow-scripts allow-same-origin');
    this.canvas.tabIndex=-1;board.stage.querySelector('.scenery').appendChild(this.canvas);
    this.onMessage=event=>{
      if(event.origin!==location.origin||event.source!==this.canvas.contentWindow)return;
      if(event.data?.type==='meute-backdrop-ready'){this.ready=true;this.applyMode();this.push();}
      if(event.data?.type==='meute-backdrop-stopped')this.fallback();
    };
    addEventListener('message',this.onMessage);
    this.observer=new MutationObserver(()=>this.push());
    this.observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  }
  setDecor(decor) {
    this.enabled=decor==='blackops'||decor==='blackops-mobile';
    this.applyMode();this.push();
    if(this.enabled&&!this.starting&&this.board.lastView?.status==='running'){
      this.starting=true;
      this.canvas.src='/godot/village.html';
    }
  }

  fallback() { this.ready=false;this.applyMode(); }
  applyMode() {
    this.board.stage.classList.toggle('remastered',this.enabled);
    this.board.stage.classList.toggle('godot-ready',this.enabled&&!!this.ready);
    this.canvas.style.visibility='visible';
    this.canvas.style.opacity=this.enabled&&this.ready?'1':'0';
  }
  light(values) {
    this.phase=backdropPhase(values);
    const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
    this.board.stage.style.setProperty('--remaster-sunset',smooth(0,0.52,this.phase));
    this.board.stage.style.setProperty('--remaster-night',smooth(0.56,1,this.phase));
    this.push();
  }
  push() {
    if(this.enabled&&!this.starting&&this.board.lastView?.status==='running'){this.starting=true;this.canvas.src='/godot/village.html';}
    if(!this.ready)return;
    const players=[...this.board.layout].map(([id,pos])=>{
      const player=this.board.lastView?.players.find(p=>p.id===id);
      return {id,x:pos.x,y:pos.y,k:pos.k,avatar:player?.avatar??'',alive:player?.alive!==false||!!this.board.lastUI?.deferDeath?.has(id)};
    });
    try{this.canvas.contentWindow.postMessage({type:'meute-backdrop-state',state:{active:this.enabled,mode:this.board.lastView?.status??'home',phase:this.phase,reduced:reducedMotion(),players:this.enabled?players:[]}},location.origin);}
    catch{this.fallback();}
  }
}
