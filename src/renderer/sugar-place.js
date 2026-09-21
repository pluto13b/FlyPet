document.addEventListener('click',e=>{if(e.button===0)window.flypet.command('sugar-place',{x:e.clientX,y:e.clientY});});
document.addEventListener('keydown',e=>{if(e.key==='Escape')window.flypet.command('sugar-cancel');});
