// Cadre du décor : aucune connexion de jeu et aucun accès au microphone ici.
(() => {
  let receiver=null, latest=null;
  window.MeuteBackdrop={
    subscribe(callback){receiver=callback;parent.postMessage({type:'meute-backdrop-ready'},location.origin);if(latest)receiver(JSON.stringify(latest));},
    unsubscribe(){receiver=null;parent.postMessage({type:'meute-backdrop-stopped'},location.origin);},
  };
  addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='meute-backdrop-state')return;
    latest=event.data.state;
    receiver?.(JSON.stringify(latest));
  });
})();
