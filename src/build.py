import re,sys,os
here=os.path.dirname(os.path.abspath(__file__))
src=open(os.path.join(here,"..","..","dashboard","dissertation-dashboard.html")).read()
shim=open(os.path.join(here,"offline-shim.js")).read()
def rep(a,b,count=1):
    global src
    assert a in src, a[:80]
    src=src.replace(a,b,count)
rep('setSync(true,canWrite?"Saved live":"View only")','setSync(true,window.OFFLINE?"On this phone":(canWrite?"Saved live":"View only"))')
# empty-state banner on Home
rep("  let h='<div class=\"stack\">';\n  h+='<div class=\"hero\">","  let h='<div class=\"stack\">';\n  if(window.OFFLINE&&!S.rqs.length&&!S.articles.length&&!S.chapters.length)h+='<div class=\"banner\">Nothing is saved on this phone yet. Go to <a href=\"#files\">Files</a> and import your dashboard file to load your chapters, studies and notes.</div>';\n  h+='<div class=\"hero\">")
# backup panel in Files
rep("""  h+='<section class="panel">';
  if(!list.length)h+='<div class="empty">Nothing added yet.""","""  if(window.OFFLINE){h+='<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>Backup and import</h3><span class="small muted" id="lastBk"></span></div><p class="small muted" style="margin:0 0 10px">Everything is saved on this phone only. Download a backup now and then. To bring in new studies or another device\\'s changes, import a dashboard file.</p><div class="row"><button class="btn primary" data-act="exportBackup">Download backup</button><label class="btn" for="importIn">Import file</label><input type="file" id="importIn" hidden accept="application/json,.json"><select id="importMode" class="btn" aria-label="How to import"><option value="merge">Add and update</option><option value="replace">Replace everything</option></select></div><p class="hint" id="importMsg" style="margin:8px 0 0">Add and update keeps your own entries and updates any with the same ID. Uploaded files stay on the phone and are not included in backups.</p></section>';}
  h+='<section class="panel">';
  if(!list.length)h+='<div class="empty">Nothing added yet.""")
rep("""  const fi=$("#fileIn");if(fi)fi.addEventListener("change",onUpload);""","""  const fi=$("#fileIn");if(fi)fi.addEventListener("change",onUpload);
  if(window.OFFLINE){const ii=$("#importIn");if(ii)ii.addEventListener("change",onImport);window.offlineData.lastBackup().then(t=>{const el=$("#lastBk");if(el)el.textContent=t?"Last backup "+new Date(t).toLocaleDateString():"No backup yet";});}""")
rep("""/* ---------- actions ---------- */""","""/* ---------- offline backup ---------- */
async function onImport(e){
  const file=e.target.files&&e.target.files[0];e.target.value="";if(!file)return;
  const mode=($("#importMode")||{}).value||"merge";const msg=$("#importMsg");
  if(mode==="replace"&&!onImport.armed){onImport.armed=true;if(msg)msg.textContent="Replace everything deletes what is on this phone first. Choose the file again to confirm.";return;}
  onImport.armed=false;
  try{const obj=JSON.parse(await file.text());const n=await window.offlineData.importObject(obj,mode);toast("Imported "+n+" entries");if(msg)msg.textContent="Imported "+n+" entries from "+file.name+".";}
  catch(err){toast("Could not import that file");if(msg)msg.textContent=(err&&err.message)||"That file could not be read.";}
}
async function exportBackup(){
  const data=JSON.stringify(window.offlineData.exportObject());
  const name="knowing-to-doing-backup-"+new Date().toISOString().slice(0,10)+".json";
  const file=new File([data],name,{type:"application/json"});
  try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});await window.offlineData.markBackup();render(true);return;}}catch(err){if(err&&err.name==="AbortError")return;}
  const a=document.createElement("a");a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);
  await window.offlineData.markBackup();render(true);
}

/* ---------- actions ---------- */""")
rep("""    case "artFilter":""","""    case "exportBackup":exportBackup();break;
    case "artFilter":""")
# ask for persistent storage once data exists
rep("""async function boot(){""","""async function boot(){
  if(window.OFFLINE)window.offlineData.persist();""")
head='''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#191C2C" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Knowing to Doing">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" href="icon-192.png" type="image/png">
<style>html{color-scheme:light dark}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
<script>'''+shim+'''</script>
</head><body>
'''
src=src.replace('<meta name="claude:viewport-fit-sides" content="cover">\n','')
out=head+src+"\n</body></html>\n"
assert "—" not in out
open(os.path.join(here,"..","index.html"),"w").write(out)
print("built",len(out))
