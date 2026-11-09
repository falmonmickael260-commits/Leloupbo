import { reducedMotion } from '../juice.js';

let projectileSequence=0;
const TOMATO = `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="tomato-red"><stop stop-color="#ff9a64"/><stop offset=".48" stop-color="#ed4931"/><stop offset="1" stop-color="#9f171c"/></radialGradient></defs><path d="M22 47C12 75 35 90 51 86C77 91 94 69 78 45C65 25 33 25 22 47Z" fill="url(#tomato-red)" stroke="#711b22" stroke-width="3"/><path d="M50 39L33 28L42 42L26 46L46 49L51 60L57 47L77 45L61 40L68 29L53 36L56 19" fill="#48773d" stroke="#284c34" stroke-width="3" stroke-linejoin="round"/><ellipse cx="32" cy="56" rx="6" ry="10" fill="#ffd4ab" opacity=".55" transform="rotate(25 32 56)"/></svg>`;
const FLOWER = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M49 43Q42 69 57 94" fill="none" stroke="#497c43" stroke-width="5"/><path d="M48 72Q16 68 30 56Q45 53 48 72M50 81Q77 77 75 64Q60 62 50 81" fill="#71994b" stroke="#3a693c" stroke-width="2"/><g fill="#f4a9bd" stroke="#bd6087" stroke-width="1.6"><ellipse cx="50" cy="23" rx="11" ry="20"/><ellipse cx="50" cy="23" rx="11" ry="20" transform="rotate(60 50 40)"/><ellipse cx="50" cy="23" rx="11" ry="20" transform="rotate(120 50 40)"/><ellipse cx="50" cy="23" rx="11" ry="20" transform="rotate(180 50 40)"/><ellipse cx="50" cy="23" rx="11" ry="20" transform="rotate(240 50 40)"/><ellipse cx="50" cy="23" rx="11" ry="20" transform="rotate(300 50 40)"/></g><circle cx="50" cy="40" r="11" fill="#f5ce6d" stroke="#ac7736" stroke-width="2"/></svg>`;

/** Courbe pure : départ et arrivée exacts ; aucun effet sur la cible métier. */
export function reactionFlight(start, end, kind, count = 24) {
  const distance = Math.hypot(end.x-start.x,end.y-start.y);
  const lift = Math.min(300,Math.max(100,distance*0.30));
  return Array.from({length:count+1},(_,i)=>{
    const t=i/count;
    const sway=kind==='flower'?Math.sin(t*Math.PI*3)*14*Math.sin(Math.PI*t):0;
    return {
      x:start.x+(end.x-start.x)*t+sway,
      y:start.y+(end.y-start.y)*t-4*lift*t*(1-t),
      rotation:kind==='tomato'?t*640:Math.sin(t*Math.PI*3)*22,
      scale:0.72+0.28*t,
      offset:t,
    };
  });
}

/** Animations décoratives annulables, nettoyées au changement de salon. */
export class ReactionEffects {
  constructor(layer, center, sound) {
    this.layer=layer; this.center=center; this.sound=sound;
    this.nodes=new Set(); this.animations=new Set(); this.generation=0;
  }
  clear() {
    this.generation++;
    for(const animation of this.animations) animation.cancel();
    this.animations.clear();
    for(const node of this.nodes) node.remove();
    this.nodes.clear();
  }
  node(className, html='') {
    const node=document.createElement('div');
    node.className=className; node.dataset.reactionVfx=''; node.innerHTML=html;
    this.layer.appendChild(node); this.nodes.add(node); return node;
  }
  animate(node, frames, options, remove=true) {
    const animation=node.animate(frames,options);
    this.animations.add(animation);
    return animation.finished.then(()=>true,()=>false).finally(()=>{
      this.animations.delete(animation);
      if(remove){node.remove();this.nodes.delete(node);}
    });
  }
  async throw(fromId,toId,kind,label) {
    if(!['tomato','flower'].includes(kind)||document.hidden) return;
    const end=this.center(toId); if(!end)return;
    const generation=this.generation;
    const start=this.center(fromId)??{x:end.x,y:end.y-180};
    const short=reducedMotion();
    const tomato=kind==='tomato';
    if(label)this.tag(end,kind,label,short);
    if(!short){
      const item=this.node(`reaction-projectile ${kind}`,tomato?TOMATO.replaceAll('tomato-red',`tomato-red-${++projectileSequence}`):FLOWER);
      const shadow=this.node('reaction-flight-shadow');
      const samples=reactionFlight(start,end,kind);
      const duration=tomato?680:1050;
      this.animate(shadow,samples.map(({offset})=>({
        transform:`translate(${start.x+(end.x-start.x)*offset}px,${start.y+(end.y-start.y)*offset+65}px) scale(${0.7+0.3*offset})`,
        opacity:0.18+0.12*offset,offset,
      })),{duration,easing:'linear',fill:'forwards'});
      const landed=await this.animate(item,samples.map(({x,y,rotation,scale,offset})=>({transform:`translate(${x}px,${y}px) rotate(${rotation}deg) scale(${scale})`,offset})),{duration,easing:'linear',fill:'forwards'});
      if(!landed||generation!==this.generation)return;
    }
    if(generation!==this.generation)return;
    this.impact(end,kind,short||reducedMotion());
    this.sound(tomato?'splat':'chime');
  }
  impact(point,kind,short) {
    const tomato=kind==='tomato';
    const stain=this.node(`reaction-stain ${kind}`);
    stain.style.left=`${point.x}px`;stain.style.top=`${point.y}px`;
    this.animate(stain,[{transform:'translate(-50%,-50%) scale(.35)',opacity:0},{transform:'translate(-50%,-50%) scale(1.08)',opacity:0.9,offset:.16},{transform:'translate(-50%,-50%) scale(1)',opacity:0,offset:1}],{duration:short?260:tomato?1150:1450,easing:'ease-out'});
    if(short)return;
    for(let i=0;i<(tomato?10:8);i++){
      const angle=i*Math.PI*2/(tomato?10:8);
      const radius=38+(i%3)*16;
      const particle=this.node(`reaction-particle ${kind}`);
      particle.style.left=`${point.x}px`;particle.style.top=`${point.y}px`;
      const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
      this.animate(particle,[
        {transform:'translate(-50%,-50%) scale(.2)',opacity:1},
        {transform:`translate(calc(-50% + ${x}px),calc(-50% + ${y-25}px)) rotate(${i*39}deg)`,opacity:.95,offset:.4},
        {transform:`translate(calc(-50% + ${x*1.2}px),calc(-50% + ${y+(tomato?35:70)}px)) rotate(${i*39+80}deg) scale(.7)`,opacity:0},
      ],{duration:tomato?800:1450,delay:(i%3)*25,easing:'cubic-bezier(.2,.6,.4,1)',fill:'both'});
    }
  }
  tag(point,kind,label,short) {
    const node=this.node(`react-tag ${kind}`);
    node.textContent=`${kind==='tomato'?'🍅':'🌸'} ${label}`;
    node.style.left=`${point.x}px`;node.style.top=`${point.y-190}px`;
    const bounds=this.layer.getBoundingClientRect();
    const scale=bounds.width/(this.layer.offsetWidth||1)||1;
    const half=node.offsetWidth*scale/2;
    const center=bounds.left+point.x*scale;
    const overflow=Math.max(0,center+half-(window.innerWidth-8))-Math.max(0,8-(center-half));
    if(overflow)node.style.left=`${point.x-overflow/scale}px`;
    this.animate(node,[{opacity:0,transform:'translate(-50%,8px)'},{opacity:1,transform:'translate(-50%,0)',offset:.12},{opacity:1,offset:.75},{opacity:0,transform:'translate(-50%,-8px)'}],{duration:short?650:2000,fill:'both'});
  }
}
