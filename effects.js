(function(){
 // sliding tab pill
 var tabs=document.querySelector('.tabs');if(tabs){var pill=document.createElement('span');pill.className='tabpill';tabs.prepend(pill);
  function move(){var a=tabs.querySelector('[aria-selected="true"]');if(!a)return;pill.style.left=a.offsetLeft+'px';pill.style.width=a.offsetWidth+'px'}
  new MutationObserver(move).observe(tabs,{attributes:true,subtree:true,attributeFilter:['aria-selected']});addEventListener('resize',move);document.fonts&&document.fonts.ready.then(move);move()}
 // animated score count-up
 var sc=document.getElementById('dailyScore');if(sc){var busy=false;new MutationObserver(function(muts){if(busy)return;if(!muts.some(function(m){return m.target===sc}))return;var n=sc.querySelector('.num');if(!n)return;var v=parseInt(n.textContent,10);if(isNaN(v))return;if(motionOff()){n.textContent=String(v);return}busy=true;n.classList.remove('pop');void n.offsetWidth;n.classList.add('pop');var t0=performance.now();(function f(t){var p=Math.min(1,(t-t0)/900);n.textContent=Math.round(v*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f);else{n.textContent=String(v);busy=false}})(t0)}).observe(sc,{childList:true})}
})();
